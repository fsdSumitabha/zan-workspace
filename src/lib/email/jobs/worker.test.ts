import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
    connectTestDb,
    disconnectTestDb,
    withoutRegionScope,
} from "@/lib/email/testing/db"
import { MailSink } from "@/lib/email/testing/sink"
import {
    resetEmailData,
    seedScenario,
    statusCounts,
} from "@/lib/email/testing/scenario"
import { setTestTransport } from "@/lib/email/delivery/transport"
import { setQueue } from "@/lib/email/queue"
import { runWorker } from "./worker"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailCampaign from "@/models/EmailCampaign"
import EmailSuppression from "@/models/EmailSuppression"
import EmailDeliveryAttempt from "@/models/EmailDeliveryAttempt"
import {
    CAMPAIGN_STATUS,
    RECIPIENT_STATUS,
    SUPPRESSION_REASON,
} from "@/constants/emailStatus"
import { expireDeadLeases } from "@/lib/email/delivery/claim"

/**
 * The delivery engine end to end, against a mail sink.
 *
 * Every send goes through the real compose path; only the socket is
 * replaced. The queue is replaced with a recorder, so a worker that chains
 * does not actually spawn another one and the test stays in control.
 */

/** A queue that records signals instead of delivering them. */
class RecordingQueue {
    readonly name = "recording"
    readonly signals: Array<{ campaignId: string; reason: string; hop: number }> = []

    async enqueue(signal: { campaignId: string; reason: string; hop: number }) {
        this.signals.push(signal)
        return true
    }
}

let queue: RecordingQueue

before(async () => {
    await connectTestDb()
})

after(async () => {
    setTestTransport(null)
    setQueue(null)
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(resetEmailData)
    queue = new RecordingQueue()
    setQueue(queue as never)
})

function run(campaignId: string) {
    return withoutRegionScope(() => runWorker({ campaignId }))
}

test("every recipient is sent exactly one email", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId, addresses } = await withoutRegionScope(() =>
        seedScenario({ recipients: 25, perSecond: 100 })
    )

    const result = await run(String(campaignId))

    assert.equal(result.submitted, 25)
    assert.equal(sink.sent.length, 25)

    const delivered = sink.recipients.sort()
    assert.deepEqual(delivered, [...addresses].sort())
})

test("no message ever carries more than one recipient", async () => {
    // The property that stops a campaign leaking its list to every reader.
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 10, perSecond: 100 })
    )

    await run(String(campaignId))

    assert.ok(sink.oneRecipientEach)
    for (const message of sink.sent) {
        assert.ok(!("cc" in message.headers))
        assert.ok(!("bcc" in message.headers))
    }
})

test("merge fields are filled and the unsubscribe header is set", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 3, perSecond: 100 })
    )

    await run(String(campaignId))

    for (const message of sink.sent) {
        assert.ok(
            !message.html.includes("{{"),
            `a merge token survived into the body: ${message.html.slice(0, 120)}`
        )
        assert.ok(message.subject.startsWith("Hello Person"))
        assert.ok(message.headers["List-Unsubscribe"])
        assert.equal(
            message.headers["List-Unsubscribe-Post"],
            "List-Unsubscribe=One-Click"
        )
    }
})

test("one bad address does not stop the rest", async () => {
    const sink = new MailSink({
        failAddresses: ["person3@sink.invalid"],
        failCode: 550,
        failMessage: "550 5.1.1 No such user here",
    })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 10, perSecond: 100 })
    )

    const result = await run(String(campaignId))

    assert.equal(result.submitted, 9)
    assert.equal(result.failed, 1)

    const counts = await withoutRegionScope(() => statusCounts(campaignId))
    assert.equal(counts[RECIPIENT_STATUS.SUBMITTED], 9)
    assert.equal(counts[RECIPIENT_STATUS.FAILED], 1)
})

test("a hard bounce adds the address to the suppression list", async () => {
    const sink = new MailSink({
        failAddresses: ["person0@sink.invalid"],
        failCode: 550,
        failMessage: "550 5.1.1 No such user here",
    })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 3, perSecond: 100, maxAttemptsTransient: 1 })
    )

    await run(String(campaignId))

    const suppressed = await withoutRegionScope(() =>
        EmailSuppression.findOne({
            emailNormalized: "person0@sink.invalid",
        }).lean<{ reason: number }>()
    )

    assert.ok(suppressed, "a permanent bounce should suppress the address")
    assert.equal(suppressed!.reason, SUPPRESSION_REASON.HARD_BOUNCE)
})

test("a transient failure retries rather than failing", async () => {
    const sink = new MailSink({
        failAddresses: ["person1@sink.invalid"],
        failCode: 421,
        failMessage: "421 4.7.0 Try again later",
    })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 5, perSecond: 100 })
    )

    await run(String(campaignId))

    const counts = await withoutRegionScope(() => statusCounts(campaignId))

    assert.equal(counts[RECIPIENT_STATUS.SUBMITTED], 4)
    assert.equal(
        counts[RECIPIENT_STATUS.RETRYING],
        1,
        "a 421 must not be treated as a permanent failure"
    )

    // And it is not suppressed: nothing is wrong with the address.
    const suppressed = await withoutRegionScope(() =>
        EmailSuppression.countDocuments({})
    )
    assert.equal(suppressed, 0)
})

test("an auth failure halts the campaign instead of retrying everyone", async () => {
    const sink = new MailSink({ authFailure: true })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 20, perSecond: 100 })
    )

    const result = await run(String(campaignId))

    assert.equal(result.stopped, "halted")

    const campaign = await withoutRegionScope(() =>
        EmailCampaign.findById(campaignId).lean<{ status: number; haltedReason: string }>()
    )

    assert.equal(campaign!.status, CAMPAIGN_STATUS.HALTED)
    assert.ok(campaign!.haltedReason.length > 0)

    // The one it tried is back in the queue with its attempt returned, so
    // fixing the password and resuming sends to everybody.
    const counts = await withoutRegionScope(() => statusCounts(campaignId))
    assert.equal(counts[RECIPIENT_STATUS.QUEUED], 20)
})

test("a paused campaign stops within one cycle", async () => {
    const sink = new MailSink({ latencyMs: 5 })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({
            recipients: 200,
            perSecond: 5,
            maxJobsPerInvocation: 5,
        })
    )

    // Pause almost immediately, while the worker is still going.
    const pause = (async () => {
        await new Promise((r) => setTimeout(r, 120))
        await withoutRegionScope(() =>
            EmailCampaign.updateOne(
                { _id: campaignId },
                { $set: { status: CAMPAIGN_STATUS.PAUSED } }
            )
        )
    })()

    const [result] = await Promise.all([run(String(campaignId)), pause])

    assert.equal(result.stopped, "paused")
    assert.ok(
        sink.sent.length < 200,
        `pause had no effect: ${sink.sent.length} of 200 still went out`
    )

    // Whatever was not sent is still queued, ready for a resume.
    const counts = await withoutRegionScope(() => statusCounts(campaignId))
    assert.ok((counts[RECIPIENT_STATUS.QUEUED] ?? 0) > 0)
})

test("a duplicate wake-up sends nobody twice", async () => {
    // Every queue adapter is at-least-once, so this happens in production.
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 30, perSecond: 100 })
    )

    await Promise.all([run(String(campaignId)), run(String(campaignId))])

    assert.equal(sink.sent.length, 30)

    const unique = new Set(sink.recipients)
    assert.equal(unique.size, 30, "somebody was sent two copies")
})

test("a crashed send is parked, never silently resent", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 5, perSecond: 100 })
    )

    // Imitate a worker killed mid-send: rows claimed, lease already dead.
    await withoutRegionScope(() =>
        CampaignRecipient.updateMany(
            { campaignId },
            {
                $set: {
                    status: RECIPIENT_STATUS.PROCESSING,
                    leaseUntil: new Date(Date.now() - 1_000),
                    attempts: 1,
                },
            }
        )
    )

    await withoutRegionScope(() => expireDeadLeases(new Date()))

    const counts = await withoutRegionScope(() => statusCounts(campaignId))
    assert.equal(counts[RECIPIENT_STATUS.UNKNOWN_OUTCOME], 5)

    // A worker running afterwards must not pick them back up.
    await run(String(campaignId))

    assert.equal(
        sink.sent.length,
        0,
        "a send whose outcome is unknown was repeated"
    )
})

test("the global rate is respected across the whole run", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 40, perSecond: 10 })
    )

    const startedAt = Date.now()
    await run(String(campaignId))
    const elapsed = Date.now() - startedAt

    assert.equal(sink.sent.length, 40)

    // 40 at 10 a second cannot finish in under three seconds, whatever the
    // concurrency. If it does, the limiter is not being consulted.
    assert.ok(
        elapsed >= 3_000,
        `40 emails at 10/sec took ${elapsed}ms, which is too fast to be limited`
    )
})

test("every attempt is written to the delivery log", async () => {
    // Vercel Hobby keeps runtime logs for one hour, so this collection is
    // the only record of what happened.
    const sink = new MailSink({ failEveryNth: 3, failCode: 421 })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 9, perSecond: 100 })
    )

    await run(String(campaignId))

    const attempts = await withoutRegionScope(() =>
        EmailDeliveryAttempt.countDocuments({ campaignId })
    )

    assert.equal(attempts, 9, "one row per attempt, successes included")

    const withResponse = await withoutRegionScope(() =>
        EmailDeliveryAttempt.countDocuments({
            campaignId,
            smtpResponse: { $exists: true, $ne: "" },
        })
    )
    assert.ok(withResponse > 0, "the server's own words should be kept")
})

test("the campaign closes itself once everyone is done", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 10, perSecond: 100 })
    )

    await run(String(campaignId))

    const campaign = await withoutRegionScope(() =>
        EmailCampaign.findById(campaignId).lean<{
            status: number
            counts: { submitted: number; total: number }
        }>()
    )

    assert.equal(campaign!.status, CAMPAIGN_STATUS.COMPLETED)
    assert.equal(campaign!.counts.submitted, 10)
    assert.equal(campaign!.counts.total, 10)
})

test("a campaign with failures closes as completed with failures", async () => {
    const sink = new MailSink({
        failAddresses: ["person0@sink.invalid"],
        failCode: 550,
    })
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 5, perSecond: 100, maxAttemptsTransient: 1 })
    )

    await run(String(campaignId))

    const campaign = await withoutRegionScope(() =>
        EmailCampaign.findById(campaignId).lean<{ status: number }>()
    )

    assert.equal(campaign!.status, CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES)
})

test("suppression added after scheduling is honoured before sending", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 5, perSecond: 100 })
    )

    // Somebody unsubscribes between the snapshot and the send. This is the
    // gap the recheck exists for.
    await withoutRegionScope(() =>
        EmailSuppression.create({
            region: "IN",
            email: "person2@sink.invalid",
            emailNormalized: "person2@sink.invalid",
            reason: SUPPRESSION_REASON.UNSUBSCRIBED,
        })
    )

    await run(String(campaignId))

    assert.equal(sink.sent.length, 4)
    assert.ok(
        !sink.recipients.includes("person2@sink.invalid"),
        "sent to somebody who had unsubscribed"
    )

    const counts = await withoutRegionScope(() => statusCounts(campaignId))
    assert.equal(counts[RECIPIENT_STATUS.SUPPRESSED], 1)
})

test("the daily budget stops the run and asks for a later retry", async () => {
    const sink = new MailSink()
    setTestTransport(sink.transporter)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({ recipients: 30, perSecond: 100, perDay: 10 })
    )

    const result = await run(String(campaignId))

    assert.equal(result.stopped, "budget")
    assert.equal(sink.sent.length, 10)

    // It should hand over rather than giving up, so the rest go tomorrow.
    assert.ok(queue.signals.length > 0, "no successor was asked for")
})
