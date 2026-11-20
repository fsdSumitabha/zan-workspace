import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
    connectTestDb,
    disconnectTestDb,
    clearCollections,
} from "@/lib/email/testing/db"
import EmailRateCounter from "@/models/EmailRateCounter"
import { takePermits, releaseNow, dailyUsage } from "./rateLimiter"

/**
 * The rate limiter is the only thing standing between ten concurrent
 * workers and ten times the agreed send rate. These tests run against a
 * real MongoDB, because the whole point is what happens when several
 * callers hit the same document at once.
 */

const NOW = new Date("2026-11-19T10:00:00.000Z")

before(async () => {
    await connectTestDb()
})

after(async () => {
    await disconnectTestDb()
})

beforeEach(async () => {
    await clearCollections([EmailRateCounter])
})

test("a single caller gets what it asks for", async () => {
    const result = await takePermits(
        { providerKey: "test", want: 5, perSecond: 10, perDay: 1000 },
        NOW
    )

    assert.equal(result.granted, 5)
    assert.equal(result.dailyBudgetReached, false)
})

test("a caller asking for more than the window gets only the window", async () => {
    const result = await takePermits(
        { providerKey: "test", want: 20, perSecond: 10, perDay: 1000 },
        NOW
    )

    assert.equal(result.granted, 10)
})

test("the second window refills on the next second", async () => {
    const first = await takePermits(
        { providerKey: "test", want: 10, perSecond: 10, perDay: 1000 },
        NOW
    )
    assert.equal(first.granted, 10)

    const sameSecond = await takePermits(
        { providerKey: "test", want: 5, perSecond: 10, perDay: 1000 },
        NOW
    )
    assert.equal(sameSecond.granted, 0, "the window is spent")

    const nextSecond = await takePermits(
        { providerKey: "test", want: 5, perSecond: 10, perDay: 1000 },
        new Date(NOW.getTime() + 1_000)
    )
    assert.equal(nextSecond.granted, 5, "a new second is a new window")
})

test("ten concurrent workers never exceed the limit", async () => {
    // The bug this file exists for. Each worker asks for 5; the window
    // allows 10. If the limiter checked before incrementing, several would
    // pass the check and the total would be 50.
    const results = await Promise.all(
        Array.from({ length: 10 }, () =>
            takePermits(
                { providerKey: "test", want: 5, perSecond: 10, perDay: 1000 },
                NOW
            )
        )
    )

    const total = results.reduce((sum, r) => sum + r.granted, 0)

    assert.equal(total, 10, `granted ${total}, the limit is 10`)
})

test("fifty concurrent callers on a budget of one get exactly one", async () => {
    const results = await Promise.all(
        Array.from({ length: 50 }, () =>
            takePermits(
                { providerKey: "test", want: 1, perSecond: 1, perDay: 1000 },
                NOW
            )
        )
    )

    const winners = results.filter((r) => r.granted === 1)

    assert.equal(winners.length, 1)
})

test("providers have separate budgets", async () => {
    const a = await takePermits(
        { providerKey: "gmail", want: 10, perSecond: 10, perDay: 1000 },
        NOW
    )
    const b = await takePermits(
        { providerKey: "ses", want: 10, perSecond: 10, perDay: 1000 },
        NOW
    )

    assert.equal(a.granted, 10)
    assert.equal(b.granted, 10, "one provider's traffic is not the other's")
})

test("the daily budget stops sending and says so", async () => {
    await takePermits(
        { providerKey: "test", want: 20, perSecond: 100, perDay: 20 },
        NOW
    )

    const blocked = await takePermits(
        { providerKey: "test", want: 5, perSecond: 100, perDay: 20 },
        new Date(NOW.getTime() + 5_000)
    )

    assert.equal(blocked.granted, 0)
    assert.equal(
        blocked.dailyBudgetReached,
        true,
        "the campaign needs to know it was the day, not the second"
    )
})

test("the daily budget is not charged for permits the second refused", async () => {
    // Without the refund in takePermits, asking for 100 with a per-second
    // limit of 10 would spend 100 of the daily budget to send 10. A
    // campaign would then stop a tenth of the way through its allowance.
    await takePermits(
        { providerKey: "test", want: 100, perSecond: 10, perDay: 1000 },
        NOW
    )

    const used = await dailyUsage("test", NOW)

    assert.equal(used, 10, `the day was charged ${used}, should be 10`)
})

test("released permits come back to both windows", async () => {
    await takePermits(
        { providerKey: "test", want: 10, perSecond: 10, perDay: 100 },
        NOW
    )

    // A worker took 10 and then could not send 4 of them, because the
    // campaign was paused between the permit and the send.
    await releaseNow("test", 4, NOW)

    const again = await takePermits(
        { providerKey: "test", want: 4, perSecond: 10, perDay: 100 },
        NOW
    )

    assert.equal(again.granted, 4)
    assert.equal(await dailyUsage("test", NOW), 10)
})

test("asking for nothing takes nothing", async () => {
    const result = await takePermits(
        { providerKey: "test", want: 0, perSecond: 10, perDay: 100 },
        NOW
    )

    assert.equal(result.granted, 0)
    assert.equal(await dailyUsage("test", NOW), 0)
})

test("buckets carry a TTL so they clean themselves up", async () => {
    await takePermits(
        { providerKey: "test", want: 1, perSecond: 10, perDay: 100 },
        NOW
    )

    const rows = await EmailRateCounter.find({}).lean<
        { _id: string; expiresAt: Date }[]
    >()

    assert.ok(rows.length >= 1)
    for (const row of rows) {
        assert.ok(
            row.expiresAt instanceof Date,
            `bucket ${row._id} has no expiry and would live for ever`
        )
        assert.ok(row.expiresAt.getTime() > NOW.getTime())
    }
})
