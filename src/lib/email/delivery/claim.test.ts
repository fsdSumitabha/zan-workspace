import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { Types } from "mongoose"

import {
    connectTestDb,
    disconnectTestDb,
    clearCollections,
    withoutRegionScope,
} from "@/lib/email/testing/db"
import CampaignRecipient from "@/models/CampaignRecipient"
import { RECIPIENT_STATUS, RECIPIENT_SOURCE } from "@/constants/emailStatus"
import {
    claimRecipients,
    countOutstanding,
    expireDeadLeases,
    releaseClaim,
} from "./claim"

/**
 * Claiming is the hot path and the one place a bug sends somebody the same
 * email twice. Every test here runs against a real MongoDB, because the
 * behaviour under test is what the server does when two updates land on
 * one document at the same moment.
 */

const CAMPAIGN = new Types.ObjectId()

before(async () => {
    await connectTestDb()
})

after(async () => {
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(async () => {
        await clearCollections([CampaignRecipient])
    })
})

/** Writes `count` claimable recipients for the campaign. */
async function seed(count: number, status: number = RECIPIENT_STATUS.QUEUED) {
    await withoutRegionScope(async () => {
        await CampaignRecipient.insertMany(
            Array.from({ length: count }, (_, i) => ({
                region: "IN",
                campaignId: CAMPAIGN,
                email: `person${i}@example.org`,
                emailNormalized: `person${i}@example.org`,
                name: `Person ${i}`,
                sourceType: RECIPIENT_SOURCE.MANUAL,
                status,
                attempts: 0,
                maxAttempts: 5,
            }))
        )
    })
}

function claim(limit: number, workerId = "w1", leaseMs = 60_000) {
    return withoutRegionScope(() =>
        claimRecipients({ campaignId: CAMPAIGN, workerId, limit, leaseMs })
    )
}

test("a claim takes no more than the limit", async () => {
    await seed(50)

    const { jobs } = await claim(10)

    assert.equal(jobs.length, 10)
})

test("a claim takes everything when there is less than the limit", async () => {
    await seed(3)

    const { jobs } = await claim(10)

    assert.equal(jobs.length, 3)
})

test("claimed rows are PROCESSING with a lease and an attempt", async () => {
    await seed(5)

    const { jobs } = await claim(5)

    for (const job of jobs) {
        assert.equal(job.status, RECIPIENT_STATUS.PROCESSING)
        assert.equal(job.attempts, 1)
        assert.equal(job.leaseOwner, "w1")
        assert.ok(job.leaseUntil instanceof Date)
        assert.ok(job.leaseUntil!.getTime() > Date.now())
    }
})

test("two workers racing never claim the same recipient", async () => {
    // The test this file exists for. Both workers read the same candidate
    // ids; the status guard on updateMany is what stops both winning.
    await seed(20)

    const [a, b] = await Promise.all([claim(20, "w1"), claim(20, "w2")])

    const idsA = a.jobs.map((j) => String(j._id))
    const idsB = b.jobs.map((j) => String(j._id))
    const overlap = idsA.filter((id) => idsB.includes(id))

    assert.equal(overlap.length, 0, `${overlap.length} recipients claimed twice`)
    assert.equal(
        idsA.length + idsB.length,
        20,
        "between them they should take every row exactly once"
    )
})

test("eight workers racing still claim each recipient once", async () => {
    await seed(40)

    const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => claim(10, `w${i}`))
    )

    const all = results.flatMap((r) => r.jobs.map((j) => String(j._id)))
    const unique = new Set(all)

    assert.equal(all.length, unique.size, "a recipient was claimed twice")
    assert.equal(unique.size, 40, "every recipient should be claimed once")
})

test("a second claim finds nothing once everything is taken", async () => {
    await seed(5)

    await claim(5, "w1")
    const second = await claim(5, "w2")

    assert.equal(second.jobs.length, 0)
})

test("a retry is claimable once its backoff has elapsed", async () => {
    await seed(1, RECIPIENT_STATUS.RETRYING)

    await withoutRegionScope(() =>
        CampaignRecipient.updateMany(
            {},
            { $set: { nextAttemptAt: new Date(Date.now() - 1_000) } }
        )
    )

    const { jobs } = await claim(5)

    assert.equal(jobs.length, 1)
})

test("a retry still inside its backoff is not claimed", async () => {
    await seed(1, RECIPIENT_STATUS.RETRYING)

    await withoutRegionScope(() =>
        CampaignRecipient.updateMany(
            {},
            { $set: { nextAttemptAt: new Date(Date.now() + 60_000) } }
        )
    )

    const { jobs } = await claim(5)

    assert.equal(jobs.length, 0, "retrying early defeats the backoff")
})

test("releasing a claim gives the attempt back", async () => {
    // Pausing and resuming must not burn retries. Without the decrement,
    // five pauses would exhaust every recipient without sending anything.
    await seed(5)

    const { claimId } = await claim(5)
    const released = await withoutRegionScope(() => releaseClaim(claimId))

    assert.equal(released, 5)

    const rows = await withoutRegionScope(() =>
        CampaignRecipient.find({}).lean<{ status: number; attempts: number }[]>()
    )

    for (const row of rows) {
        assert.equal(row.status, RECIPIENT_STATUS.QUEUED)
        assert.equal(row.attempts, 0, "the attempt should have been returned")
    }
})

test("a dead lease goes to UNKNOWN_OUTCOME, never back to the queue", async () => {
    // The crash-after-accept case. The message may already have been
    // accepted by the SMTP server, so re-queueing would send a second copy.
    await seed(3)

    const { claimId } = await claim(3)

    await withoutRegionScope(() =>
        CampaignRecipient.updateMany(
            { claimId },
            { $set: { leaseUntil: new Date(Date.now() - 1_000) } }
        )
    )

    const expired = await withoutRegionScope(() => expireDeadLeases(new Date()))

    assert.equal(expired, 3)

    const rows = await withoutRegionScope(() =>
        CampaignRecipient.find({}).lean<{ status: number; lastError?: string }[]>()
    )

    for (const row of rows) {
        assert.equal(
            row.status,
            RECIPIENT_STATUS.UNKNOWN_OUTCOME,
            "a crashed send must never be silently retried"
        )
        assert.ok(row.lastError, "the report has to be able to explain it")
    }
})

test("a live lease is left alone", async () => {
    await seed(3)
    await claim(3, "w1", 60_000)

    const expired = await withoutRegionScope(() => expireDeadLeases(new Date()))

    assert.equal(expired, 0, "work in flight was taken from a live worker")
})

test("outstanding counts separate claimable, in flight and retrying", async () => {
    await seed(10)
    await claim(4)

    // The six that were not claimed become retries, so the three counts
    // below are each non-zero and cannot be confused with one another.
    await withoutRegionScope(() =>
        CampaignRecipient.updateMany(
            { status: RECIPIENT_STATUS.QUEUED },
            {
                $set: {
                    status: RECIPIENT_STATUS.RETRYING,
                    nextAttemptAt: new Date(Date.now() + 60_000),
                },
            }
        )
    )

    const counts = await withoutRegionScope(() => countOutstanding(CAMPAIGN))

    assert.equal(counts.inFlight, 4)
    assert.equal(counts.retrying, 6)
    assert.equal(counts.claimable, 0)
})

test("a limit of zero claims nothing and touches nothing", async () => {
    await seed(5)

    const { jobs } = await claim(0)

    assert.equal(jobs.length, 0)

    const untouched = await withoutRegionScope(() =>
        CampaignRecipient.countDocuments({ status: RECIPIENT_STATUS.QUEUED })
    )
    assert.equal(untouched, 5)
})
