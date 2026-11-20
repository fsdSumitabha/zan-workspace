import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
    clearCollections,
    connectTestDb,
    disconnectTestDb,
    withoutRegionScope,
} from "@/lib/email/testing/db"
import EmailDeliveryConfig from "@/models/EmailDeliveryConfig"
import {
    assertSendingAllowed,
    getProvider,
    getProviderWithSecret,
    recordTestResult,
    setKillSwitch,
} from "./providerConfig"
import { DELIVERY_LIMITS } from "./deliveryConfig"

/**
 * The sending account comes from the environment and the kill switch comes
 * from the database. These tests cover the seam between the two.
 *
 * The round trips matter more than they look. A field that is written and
 * then read back as undefined is the kind of fault that only shows up when
 * somebody switches sending off in an emergency and it does not stop.
 */

const REGION = "IN"

const SALES = {
    SALES_SMTP_HOST: "smtp.gmail.invalid",
    SALES_SMTP_PORT: "465",
    SALES_SMTP_USER: "sales@zan.invalid",
    SALES_SMTP_PASS: "not-a-real-password",
} as const

const saved = new Map<string, string | undefined>()

before(async () => {
    for (const [key, value] of Object.entries(SALES)) {
        saved.set(key, process.env[key])
        process.env[key] = value
    }
    await connectTestDb()
})

after(async () => {
    for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(() => clearCollections([EmailDeliveryConfig]))
})

test("the connection comes from the environment", async () => {
    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.user, "sales@zan.invalid")
    assert.equal(provider?.host, "smtp.gmail.invalid")
    assert.equal(provider?.port, 465)
    assert.equal(provider?.secure, true)
    assert.equal(provider?.hasPassword, true)
})

test("the limits come from the code, not from a row", async () => {
    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.globalPerSecond, DELIVERY_LIMITS.globalPerSecond)
    assert.equal(provider?.globalPerDay, DELIVERY_LIMITS.globalPerDay)
    assert.equal(provider?.maxConnections, DELIVERY_LIMITS.maxConnections)
})

test("no row means sending is allowed", async () => {
    // Nothing has to be set up before a campaign can send. An absent row is
    // the normal state, not an unconfigured one.
    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.killSwitch, false)
    assert.doesNotThrow(() => assertSendingAllowed(provider!))
})

test("the kill switch survives a write and a read", async () => {
    await withoutRegionScope(() =>
        setKillSwitch(REGION, true, "bounces climbing")
    )

    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.killSwitch, true)
    assert.equal(provider?.killSwitchReason, "bounces climbing")
    assert.throws(
        () => assertSendingAllowed(provider!),
        /bounces climbing/,
        "a switched-off region still allowed sending"
    )
})

test("switching sending back on clears the reason", async () => {
    await withoutRegionScope(async () => {
        await setKillSwitch(REGION, true, "bounces climbing")
        await setKillSwitch(REGION, false)
    })

    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.killSwitch, false)
    assert.equal(provider?.killSwitchReason, undefined)
    // A stale reason next to "sending is on" is how somebody concludes the
    // switch did not work.
    assert.doesNotThrow(() => assertSendingAllowed(provider!))
})

test("the kill switch stops the worker's own path too", async () => {
    await withoutRegionScope(() => setKillSwitch(REGION, true, "testing"))

    const provider = await withoutRegionScope(() =>
        getProviderWithSecret(REGION)
    )

    assert.equal(provider.killSwitch, true)
    assert.equal(provider.pass, "not-a-real-password")
    assert.ok(provider.passHash.length > 0, "no fingerprint for the pool")
})

test("a connection test result survives a write and a read", async () => {
    await withoutRegionScope(() =>
        recordTestResult(REGION, { ok: true, message: "Connected and signed in." })
    )

    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.lastTestOk, true)
    assert.equal(provider?.lastTestMessage, "Connected and signed in.")
    assert.ok(provider?.lastTestAt instanceof Date, "no time was recorded")
})

test("a failed test is recorded as failed, not as untested", async () => {
    // null means nobody has tried. false means somebody tried and it did
    // not work. The screens say different things about each.
    await withoutRegionScope(() =>
        recordTestResult(REGION, { ok: false, message: "535 bad credentials" })
    )

    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.lastTestOk, false)
    assert.equal(provider?.lastTestMessage, "535 bad credentials")
})

test("recording a test does not switch sending off", async () => {
    // Both live on the same row and both upsert it. A test must never be
    // able to stop a campaign as a side effect.
    await withoutRegionScope(() =>
        recordTestResult(REGION, { ok: true, message: "fine" })
    )

    const provider = await withoutRegionScope(() => getProvider(REGION))
    assert.equal(provider?.killSwitch, false)
})

test("switching the kill switch does not wipe the test result", async () => {
    await withoutRegionScope(async () => {
        await recordTestResult(REGION, { ok: true, message: "fine" })
        await setKillSwitch(REGION, true, "unrelated")
    })

    const provider = await withoutRegionScope(() => getProvider(REGION))

    assert.equal(provider?.lastTestOk, true)
    assert.equal(provider?.killSwitch, true)
})

test("the sales account missing is reported, not guessed at", async () => {
    const was = process.env.SALES_SMTP_PASS
    delete process.env.SALES_SMTP_PASS
    try {
        const provider = await withoutRegionScope(() => getProvider(REGION))
        assert.equal(provider, null)

        await assert.rejects(
            () => withoutRegionScope(() => getProviderWithSecret(REGION)),
            /sales mailbox is not set up/i
        )
    } finally {
        process.env.SALES_SMTP_PASS = was
    }
})
