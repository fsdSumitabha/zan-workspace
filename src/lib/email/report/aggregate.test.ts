import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { Types } from "mongoose"

import {
    connectTestDb,
    disconnectTestDb,
    clearCollections,
    withoutRegionScope,
} from "@/lib/email/testing/db"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailDeliveryAttempt from "@/models/EmailDeliveryAttempt"
import EmailTrackingEvent from "@/models/EmailTrackingEvent"
import {
    ATTEMPT_OUTCOME,
    CAMPAIGN_STATUS,
    ERROR_CLASS,
    RECIPIENT_SOURCE,
    RECIPIENT_STATUS,
    TRACKING_EVENT,
} from "@/constants/emailStatus"
import { buildCampaignReport, buildComparison } from "./aggregate"

/**
 * The report is built by MongoDB aggregations, so it is tested against a
 * real MongoDB. The two-stage group that counts unique clicks per link,
 * and the percentile read over sorted durations, are the kind of thing
 * that looks right and returns the wrong number.
 *
 * Every address here is on `.invalid`, which RFC 2606 reserves, so no row
 * written by these tests could ever name a real person.
 */

const REGION = "IN" as const

/**
 * A distinct 32-character hex tracking token.
 *
 * The column is uniquely indexed across every campaign, so this counter
 * runs for the whole file. A per-campaign counter collides as soon as one
 * test seeds two campaigns.
 */
let tokenSeq = 0

function nextToken(): string {
    tokenSeq++
    return tokenSeq.toString(16).padStart(32, "0")
}

/** Tracking and attempt rows both carry a required TTL date. */
const EXPIRES = new Date("2027-11-19T00:00:00Z")
const MODELS = [
    EmailCampaign,
    CampaignRecipient,
    EmailDeliveryAttempt,
    EmailTrackingEvent,
]

before(async () => {
    await connectTestDb()
})

after(async () => {
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(async () => {
        await clearCollections(MODELS)
    })
})

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

interface SeedOptions {
    name?: string
    /** How many recipients in each status. */
    counts: Partial<Record<number, number>>
    engagement?: Partial<{
        uniqueOpens: number
        totalOpens: number
        uniqueClicks: number
        totalClicks: number
        unsubscribes: number
        complaints: number
    }>
    startedAt?: Date
    finishedAt?: Date
    status?: number
}

async function seedCampaign(options: SeedOptions): Promise<IEmailCampaign> {
    return withoutRegionScope(async () => {
        const campaign = await EmailCampaign.create({
            region: REGION,
            name: options.name ?? "Test campaign",
            subject: "Subject line",
            status: options.status ?? CAMPAIGN_STATUS.COMPLETED,
            startedAt: options.startedAt ?? new Date("2026-11-19T09:00:00Z"),
            finishedAt: options.finishedAt ?? new Date("2026-11-19T09:00:20Z"),
            engagement: {
                uniqueOpens: 0,
                totalOpens: 0,
                uniqueClicks: 0,
                totalClicks: 0,
                unsubscribes: 0,
                complaints: 0,
                ...options.engagement,
            },
        })

        const campaignId = campaign._id as Types.ObjectId
        const docs: Record<string, unknown>[] = []
        let n = 0

        for (const [status, count] of Object.entries(options.counts)) {
            for (let i = 0; i < (count ?? 0); i++) {
                n++
                docs.push({
                    region: REGION,
                    campaignId,
                    email: `person-${n}@example.invalid`,
                    emailNormalized: `person-${n}@example.invalid`,
                    name: `Person ${n}`,
                    status: Number(status),
                    sourceType: RECIPIENT_SOURCE.MANUAL,
                    attempts: 1,
                    trackingToken: nextToken(),
                    lastError:
                        Number(status) === RECIPIENT_STATUS.FAILED
                            ? "550 5.1.1 No such user"
                            : undefined,
                    lastErrorClass:
                        Number(status) === RECIPIENT_STATUS.FAILED
                            ? ERROR_CLASS.PERMANENT
                            : undefined,
                })
            }
        }

        if (docs.length > 0) {
            await CampaignRecipient.insertMany(docs, { ordered: false })
        }

        return (await EmailCampaign.findById(
            campaignId
        ).lean<IEmailCampaign>())!
    })
}

/* ------------------------------------------------------------------ */
/* Totals                                                             */
/* ------------------------------------------------------------------ */

test("accepted counts submitted, delivered and bounced together", async () => {
    const campaign = await seedCampaign({
        counts: {
            [RECIPIENT_STATUS.SUBMITTED]: 10,
            [RECIPIENT_STATUS.DELIVERED]: 5,
            [RECIPIENT_STATUS.BOUNCED]: 2,
            [RECIPIENT_STATUS.FAILED]: 3,
        },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: true })
    )

    assert.equal(report.totals.recipients, 20)

    /**
     * A delivered or bounced recipient was accepted first. Its status
     * simply moved on. Counting only SUBMITTED would make every rate
     * computed over "accepted" rise as deliveries are confirmed, which
     * would be a reporting bug that looks like good news.
     */
    assert.equal(report.totals.accepted, 17)
    assert.equal(report.totals.delivered, 5)
    assert.equal(report.totals.bounced, 2)
    assert.equal(report.totals.failed, 3)
})

test("unfinished work is counted apart from finished work", async () => {
    const campaign = await seedCampaign({
        counts: {
            [RECIPIENT_STATUS.PENDING]: 4,
            [RECIPIENT_STATUS.QUEUED]: 3,
            [RECIPIENT_STATUS.PROCESSING]: 2,
            [RECIPIENT_STATUS.RETRYING]: 1,
            [RECIPIENT_STATUS.SUBMITTED]: 5,
        },
        status: CAMPAIGN_STATUS.SENDING,
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.totals.stillToSend, 10)
    assert.equal(report.totals.accepted, 5)
    assert.equal(report.totals.recipients, 15)
})

test("an unknown outcome is reported, never hidden", async () => {
    const campaign = await seedCampaign({
        counts: {
            [RECIPIENT_STATUS.SUBMITTED]: 8,
            [RECIPIENT_STATUS.UNKNOWN_OUTCOME]: 2,
        },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    // Not folded into accepted, and not into failed. It is its own fact:
    // we do not know whether those two went out.
    assert.equal(report.totals.unknown, 2)
    assert.equal(report.totals.accepted, 8)
    assert.equal(report.totals.failed, 0)
})

/* ------------------------------------------------------------------ */
/* Rates                                                              */
/* ------------------------------------------------------------------ */

test("a provider that does not confirm delivery gets null, not zero", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 10 },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    /**
     * The whole reason this flag exists. With Gmail, DELIVERED stays at
     * zero because nothing reports it. A rate of 0% would say every
     * message failed to arrive; null says nobody measured.
     */
    assert.equal(report.rates.deliveredOfAccepted, null)
    assert.equal(report.deliveryConfirmed, false)
})

test("a confirming provider gets a real delivered rate", async () => {
    const campaign = await seedCampaign({
        counts: {
            [RECIPIENT_STATUS.DELIVERED]: 9,
            [RECIPIENT_STATUS.BOUNCED]: 1,
        },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: true })
    )

    assert.equal(report.totals.accepted, 10)
    assert.equal(report.rates.deliveredOfAccepted, 90)
    assert.equal(report.rates.bouncedOfAccepted, 10)
})

test("rates over an empty base are null rather than zero", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUPPRESSED]: 5 },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: true })
    )

    // Nothing was accepted, so there is no base for an open rate.
    assert.equal(report.totals.accepted, 0)
    assert.equal(report.rates.openedOfAccepted, null)
    assert.equal(report.rates.clickedOfAccepted, null)
    assert.equal(report.rates.bouncedOfAccepted, null)

    // These two have a base of every recipient, which does exist.
    assert.equal(report.rates.acceptedOfRecipients, 0)
    assert.equal(report.rates.failedOfRecipients, 0)
})

test("clicked-after-opening divides by opens, not by accepted", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 100 },
        engagement: { uniqueOpens: 40, uniqueClicks: 10 },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.rates.openedOfAccepted, 40)
    assert.equal(report.rates.clickedOfAccepted, 10)
    // 10 of 40 who opened, not 10 of 100 who were sent to.
    assert.equal(report.rates.clickedOfOpened, 25)
})

test("no campaign at all does not divide by zero", async () => {
    const campaign = await seedCampaign({ counts: {} })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.totals.recipients, 0)
    assert.equal(report.rates.acceptedOfRecipients, 0)
    // It ran for 20 seconds and accepted nothing, so nought per second is
    // the true answer here, unlike the campaign that never ran at all.
    assert.equal(report.timing.throughput, 0)
})

/* ------------------------------------------------------------------ */
/* Links                                                              */
/* ------------------------------------------------------------------ */

test("a link clicked five times by one person counts as one person", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 3 },
    })

    const campaignId = campaign._id as Types.ObjectId
    const alice = new Types.ObjectId()
    const bob = new Types.ObjectId()
    const url = "https://example.invalid/offer"

    await withoutRegionScope(async () => {
        await EmailTrackingEvent.insertMany([
            // Alice clicked the same link five times.
            ...Array.from({ length: 5 }, () => ({
                region: REGION,
                campaignId,
                recipientId: alice,
                type: TRACKING_EVENT.CLICK,
                url,
                at: new Date(),
                expiresAt: EXPIRES,
            })),
            // Bob clicked it once.
            {
                region: REGION,
                campaignId,
                recipientId: bob,
                type: TRACKING_EVENT.CLICK,
                url,
                at: new Date(),
                expiresAt: EXPIRES,
            },
        ])
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.links.length, 1)
    assert.equal(report.links[0].url, url)
    assert.equal(report.links[0].clicks, 6, "every click")
    assert.equal(report.links[0].uniqueClicks, 2, "two people")
})

test("links come back most clicked first", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 3 },
    })

    const campaignId = campaign._id as Types.ObjectId

    await withoutRegionScope(async () => {
        await EmailTrackingEvent.insertMany([
            ...Array.from({ length: 2 }, () => ({
                region: REGION,
                campaignId,
                recipientId: new Types.ObjectId(),
                type: TRACKING_EVENT.CLICK,
                url: "https://example.invalid/quiet",
                at: new Date(),
                expiresAt: EXPIRES,
            })),
            ...Array.from({ length: 7 }, () => ({
                region: REGION,
                campaignId,
                recipientId: new Types.ObjectId(),
                type: TRACKING_EVENT.CLICK,
                url: "https://example.invalid/popular",
                at: new Date(),
                expiresAt: EXPIRES,
            })),
        ])
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.deepEqual(
        report.links.map((l) => l.url),
        [
            "https://example.invalid/popular",
            "https://example.invalid/quiet",
        ]
    )
})

test("an open event is not counted as a link click", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 1 },
    })

    const campaignId = campaign._id as Types.ObjectId

    await withoutRegionScope(async () => {
        await EmailTrackingEvent.create({
            region: REGION,
            campaignId,
            recipientId: new Types.ObjectId(),
            type: TRACKING_EVENT.OPEN,
            at: new Date(),
                expiresAt: EXPIRES,
        })
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.deepEqual(report.links, [])
})

/* ------------------------------------------------------------------ */
/* Failures and latency                                               */
/* ------------------------------------------------------------------ */

test("failures are grouped by class, with an example, most common first", async () => {
    const campaign = await seedCampaign({
        counts: {
            [RECIPIENT_STATUS.FAILED]: 4,
            [RECIPIENT_STATUS.SUBMITTED]: 1,
        },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.failures.length, 1)
    assert.equal(report.failures[0].errorClass, ERROR_CLASS.PERMANENT)
    assert.equal(report.failures[0].count, 4)
    assert.equal(report.failures[0].label, "Address rejected")
    // The provider's own words, so somebody can act on them.
    assert.ok(report.failures[0].example.includes("550"))
})

test("latency percentiles read from the sorted durations", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 1 },
    })

    const campaignId = campaign._id as Types.ObjectId

    // 100 attempts, 1 ms to 100 ms.
    await withoutRegionScope(async () => {
        await EmailDeliveryAttempt.insertMany(
            Array.from({ length: 100 }, (_, i) => ({
                region: REGION,
                campaignId,
                recipientId: new Types.ObjectId(),
                attemptNo: 1,
                workerId: "test",
                startedAt: new Date(),
                durationMs: i + 1,
                outcome: ATTEMPT_OUTCOME.ACCEPTED,
                expiresAt: EXPIRES,
            }))
        )
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.latency.samples, 100)

    // Not an exact-interpolation percentile, and not claimed to be: the
    // value at the index is one of the real measurements.
    assert.ok(
        report.latency.p50 >= 50 && report.latency.p50 <= 52,
        `p50 was ${report.latency.p50}`
    )
    assert.ok(
        report.latency.p95 >= 95 && report.latency.p95 <= 97,
        `p95 was ${report.latency.p95}`
    )
    assert.ok(report.latency.p99 <= 100, "never past the largest measurement")
})

test("no attempts gives zero samples rather than a wrong number", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 1 },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.latency.samples, 0)
    assert.equal(report.latency.p50, 0)
    assert.equal(report.latency.p99, 0)
})

/* ------------------------------------------------------------------ */
/* Timing                                                             */
/* ------------------------------------------------------------------ */

test("throughput is accepted mail over the time it took", async () => {
    const campaign = await seedCampaign({
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 50 },
        startedAt: new Date("2026-11-19T09:00:00Z"),
        finishedAt: new Date("2026-11-19T09:00:25Z"),
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.timing.durationMs, 25_000)
    assert.equal(report.timing.throughput, 2)
})

test("a campaign that never started has no duration and no throughput", async () => {
    const campaign = await withoutRegionScope(async () => {
        const row = await EmailCampaign.create({
            region: REGION,
            name: "Never started",
            subject: "x",
            status: CAMPAIGN_STATUS.CANCELLED,
        })

        return (await EmailCampaign.findById(
            row._id
        ).lean<IEmailCampaign>())!
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(campaign, { deliveryConfirmed: false })
    )

    assert.equal(report.timing.startedAt, null)
    assert.equal(report.timing.durationMs, null)
    // Null, not zero. Zero per second would mean it ran and sent nothing.
    assert.equal(report.timing.throughput, null)
})

/* ------------------------------------------------------------------ */
/* Comparison                                                         */
/* ------------------------------------------------------------------ */

test("the comparison reads every campaign in one aggregation", async () => {
    const first = await seedCampaign({
        name: "First",
        counts: {
            [RECIPIENT_STATUS.SUBMITTED]: 10,
            [RECIPIENT_STATUS.FAILED]: 2,
        },
        engagement: { uniqueOpens: 5, uniqueClicks: 1 },
    })

    const second = await seedCampaign({
        name: "Second",
        counts: {
            [RECIPIENT_STATUS.DELIVERED]: 20,
            [RECIPIENT_STATUS.BOUNCED]: 4,
        },
        engagement: { uniqueOpens: 12, uniqueClicks: 6 },
    })

    const rows = await withoutRegionScope(() =>
        buildComparison([first, second])
    )

    assert.equal(rows.length, 2)

    // The rows come back in the order the campaigns were given, so a
    // screen's own sort is never silently overridden.
    assert.equal(rows[0].name, "First")
    assert.equal(rows[0].recipients, 12)
    assert.equal(rows[0].accepted, 10)
    assert.equal(rows[0].failed, 2)
    assert.equal(rows[0].openRate, 50)

    assert.equal(rows[1].name, "Second")
    assert.equal(rows[1].accepted, 24, "delivered and bounced were accepted")
    assert.equal(rows[1].bounced, 4)
    assert.equal(rows[1].bounceRate, 16.7)
})

test("a campaign with no recipient rows comes back as zeroes, not missing", async () => {
    const empty = await seedCampaign({ name: "Empty", counts: {} })
    const full = await seedCampaign({
        name: "Full",
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 3 },
    })

    const rows = await withoutRegionScope(() =>
        buildComparison([empty, full])
    )

    // A row per campaign given. Dropping the empty one would make a
    // campaign disappear from a table it belongs in.
    assert.equal(rows.length, 2)
    assert.equal(rows[0].name, "Empty")
    assert.equal(rows[0].recipients, 0)
    assert.equal(rows[0].openRate, null, "no base, so no rate")
})

test("comparing nothing returns nothing, without querying", async () => {
    const rows = await buildComparison([])
    assert.deepEqual(rows, [])
})

test("one campaign's recipients never count towards another's", async () => {
    const mine = await seedCampaign({
        name: "Mine",
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 4 },
    })
    await seedCampaign({
        name: "Theirs",
        counts: { [RECIPIENT_STATUS.SUBMITTED]: 99 },
    })

    const report = await withoutRegionScope(() =>
        buildCampaignReport(mine, { deliveryConfirmed: false })
    )

    assert.equal(report.totals.recipients, 4)
})
