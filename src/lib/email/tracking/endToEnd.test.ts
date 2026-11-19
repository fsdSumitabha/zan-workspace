import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
    connectTestDb,
    disconnectTestDb,
    withoutRegionScope,
} from "@/lib/email/testing/db"
import { MailSink } from "@/lib/email/testing/sink"
import { resetEmailData, seedScenario } from "@/lib/email/testing/scenario"
import { setTestTransport } from "@/lib/email/delivery/transport"
import { setQueue } from "@/lib/email/queue"
import { runWorker } from "@/lib/email/jobs/worker"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailCampaign from "@/models/EmailCampaign"
import EmailSuppression from "@/models/EmailSuppression"
import EmailTrackingEvent from "@/models/EmailTrackingEvent"
import { TRACKING_EVENT, RECIPIENT_STATUS } from "@/constants/emailStatus"
import { recordEvent, recipientByToken } from "./record"
import { decodeTarget, verifyTarget } from "./token"

/**
 * Tracking through the real send path, and the counters it keeps.
 */

before(async () => {
    process.env.EMAIL_TRACKING_SECRET ??= "test-tracking-secret-long-enough"
    process.env.EMAIL_PUBLIC_ORIGIN ??= "http://localhost:3000"
    await connectTestDb()
})

after(async () => {
    setTestTransport(null)
    setQueue(null)
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(resetEmailData)
    setQueue({ name: "noop", async enqueue() { return true } })
})

test("a sent email carries a tracked link and an open pixel", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )

    await withoutRegionScope(() => runWorker({ campaignId: String(campaignId) }))

    assert.equal(sink.sent.length, 1)
    const html = sink.sent[0].html

    assert.ok(html.includes("/api/e/o/"), "no open pixel")
    assert.ok(html.includes("/api/e/c/"), "the link was not rewritten")

    // The rewritten link still verifies, which is what the redirect checks.
    const match = html.match(/\/api\/e\/c\/([a-z0-9]+)\?u=([^&"]+)&s=([^"]+)/i)
    assert.ok(match, "the tracked link is malformed")

    const [, token, encoded, signature] = match!
    const target = decodeTarget(encoded)

    assert.equal(target, "https://zan.invalid/offer")
    assert.equal(verifyTarget(token, target!, signature), true)
})

test("the unsubscribe link is not routed through the click tracker", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )

    await withoutRegionScope(() => runWorker({ campaignId: String(campaignId) }))

    const html = sink.sent[0].html

    assert.ok(html.includes("/e/u/"), "no unsubscribe link in the email")
    // The path must appear raw, not wrapped in a redirect.
    assert.ok(
        !/\/api\/e\/c\/[^"]*e%2Fu/i.test(html),
        "the unsubscribe link was wrapped in the tracker"
    )
})

test("a token finds its recipient, and rubbish finds nothing", async () => {
    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 2, perSecond: 100 })
    )

    const rows = await withoutRegionScope(() =>
        CampaignRecipient.find({ campaignId })
            .lean<{ trackingToken?: string }[]>()
    )

    const token = rows[0].trackingToken!
    const found = await withoutRegionScope(() => recipientByToken(token))

    assert.ok(found)
    assert.equal(found!.trackingToken, token)

    // Shapes a prober would try.
    for (const bad of ["", "short", "../../etc", "z".repeat(32), "<script>"]) {
        assert.equal(
            await withoutRegionScope(() => recipientByToken(bad)),
            null,
            `"${bad}" should not resolve`
        )
    }
})

test("the first open counts as unique, the second only as total", async () => {
    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )

    const recipient = await withoutRegionScope(() =>
        CampaignRecipient.findOne({ campaignId }).lean()
    )

    await withoutRegionScope(async () => {
        await recordEvent({ recipient: recipient as never, type: TRACKING_EVENT.OPEN })
        await recordEvent({ recipient: recipient as never, type: TRACKING_EVENT.OPEN })
        await recordEvent({ recipient: recipient as never, type: TRACKING_EVENT.OPEN })
    })

    const campaign = await withoutRegionScope(() =>
        EmailCampaign.findById(campaignId).lean<{
            engagement: { uniqueOpens: number; totalOpens: number }
        }>()
    )

    assert.equal(campaign!.engagement.uniqueOpens, 1, "one person, one unique")
    assert.equal(campaign!.engagement.totalOpens, 3)

    const row = await withoutRegionScope(() =>
        CampaignRecipient.findById(recipient!._id).lean<{ openCount: number }>()
    )
    assert.equal(row!.openCount, 3)
})

test("an unsubscribe suppresses the address permanently", async () => {
    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )

    const recipient = await withoutRegionScope(() =>
        CampaignRecipient.findOne({ campaignId }).lean()
    )

    await withoutRegionScope(() =>
        recordEvent({
            recipient: recipient as never,
            type: TRACKING_EVENT.UNSUBSCRIBE,
        })
    )

    const suppressed = await withoutRegionScope(() =>
        EmailSuppression.findOne({
            emailNormalized: (recipient as never as { emailNormalized: string })
                .emailNormalized,
        }).lean<{ reason: number }>()
    )

    assert.ok(suppressed, "an unsubscribe must suppress the address")

    const campaign = await withoutRegionScope(() =>
        EmailCampaign.findById(campaignId).lean<{
            engagement: { unsubscribes: number }
        }>()
    )
    assert.equal(campaign!.engagement.unsubscribes, 1)
})

test("a hard bounce suppresses, a soft bounce does not", async () => {
    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 2, perSecond: 100 })
    )

    const rows = await withoutRegionScope(() =>
        CampaignRecipient.find({ campaignId }).lean()
    )

    await withoutRegionScope(async () => {
        await recordEvent({
            recipient: rows[0] as never,
            type: TRACKING_EVENT.BOUNCE_HARD,
        })
        await recordEvent({
            recipient: rows[1] as never,
            type: TRACKING_EVENT.BOUNCE_SOFT,
        })
    })

    const suppressed = await withoutRegionScope(() =>
        EmailSuppression.find({}).lean<{ emailNormalized: string }[]>()
    )

    assert.equal(suppressed.length, 1, "only the hard bounce should suppress")
    assert.equal(
        suppressed[0].emailNormalized,
        (rows[0] as never as { emailNormalized: string }).emailNormalized
    )
})

test("a delivery report only moves a recipient that was submitted", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )
    await withoutRegionScope(() => runWorker({ campaignId: String(campaignId) }))

    const recipient = await withoutRegionScope(() =>
        CampaignRecipient.findOne({ campaignId }).lean()
    )

    await withoutRegionScope(async () => {
        await recordEvent({
            recipient: recipient as never,
            type: TRACKING_EVENT.DELIVERED,
        })
        // A repeat, as a provider retrying its webhook would send.
        await recordEvent({
            recipient: recipient as never,
            type: TRACKING_EVENT.DELIVERED,
        })
    })

    const row = await withoutRegionScope(() =>
        CampaignRecipient.findById(recipient!._id).lean<{ status: number }>()
    )
    assert.equal(row!.status, RECIPIENT_STATUS.DELIVERED)

    const campaign = await withoutRegionScope(() =>
        EmailCampaign.findById(campaignId).lean<{
            counts: { delivered: number; submitted: number }
        }>()
    )

    // The repeat must not count twice, or Delivered would exceed the
    // number of emails that were sent.
    assert.equal(campaign!.counts.delivered, 1)
    assert.equal(campaign!.counts.submitted, 0)
})

test("every tracking event carries an expiry", async () => {
    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )
    const recipient = await withoutRegionScope(() =>
        CampaignRecipient.findOne({ campaignId }).lean()
    )

    await withoutRegionScope(() =>
        recordEvent({ recipient: recipient as never, type: TRACKING_EVENT.OPEN })
    )

    const events = await withoutRegionScope(() =>
        EmailTrackingEvent.find({}).lean<{ expiresAt: Date }[]>()
    )

    assert.equal(events.length, 1)
    assert.ok(
        events[0].expiresAt instanceof Date &&
        events[0].expiresAt.getTime() > Date.now(),
        "an event without an expiry would live for ever"
    )
})

test("an IP is never stored in the clear", async () => {
    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 1, perSecond: 100 })
    )
    const recipient = await withoutRegionScope(() =>
        CampaignRecipient.findOne({ campaignId }).lean()
    )

    const { hashIp } = await import("./token")

    await withoutRegionScope(() =>
        recordEvent({
            recipient: recipient as never,
            type: TRACKING_EVENT.OPEN,
            ipHash: hashIp("198.51.100.4"),
        })
    )

    const event = await withoutRegionScope(() =>
        EmailTrackingEvent.findOne({}).lean<{ ipHash?: string }>()
    )

    assert.ok(event!.ipHash)
    assert.ok(!event!.ipHash!.includes("198.51.100.4"))
    assert.ok(!event!.ipHash!.includes("198"))
})
