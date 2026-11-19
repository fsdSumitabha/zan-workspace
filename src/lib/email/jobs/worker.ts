import { Types } from "mongoose"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import EmailDeliveryAttempt from "@/models/EmailDeliveryAttempt"
import EmailSenderIdentity, {
    type IEmailSenderIdentity,
} from "@/models/EmailSenderIdentity"
import EmailTemplateVersion, {
    type IEmailTemplateVersion,
} from "@/models/EmailTemplateVersion"
import EmailSuppression from "@/models/EmailSuppression"
import {
    ATTEMPT_OUTCOME,
    CAMPAIGN_STATUS,
    ERROR_CLASS,
    RECIPIENT_STATUS,
    SUPPRESSION_REASON,
    type ErrorClass,
} from "@/constants/emailStatus"
import {
    claimDeadlineMs,
    getDeliverySettings,
    withOverrides,
    type DeliverySettings,
} from "@/lib/email/config/deliveryConfig"
import {
    assertSendingAllowed,
    getProviderWithSecret,
    type ProviderWithSecret,
} from "@/lib/email/config/providerConfig"
import { getTransport } from "@/lib/email/delivery/transport"
import { claimRecipients, countOutstanding, releaseClaim } from "@/lib/email/delivery/claim"
import { takePermits, releaseNow } from "@/lib/email/delivery/rateLimiter"
import { attemptsFor, classifySmtpError, shouldSuppressOnFailure } from "@/lib/email/delivery/classify"
import { nextAttemptAt, throttleWaitMs } from "@/lib/email/delivery/backoff"
import { buildMessageId, sendingDomainOf } from "@/lib/email/delivery/messageId"
import { sendOne, unsubscribeUrlFor } from "@/lib/email/delivery/send"
import { trackingReady } from "@/lib/email/tracking/token"
import { getQueue } from "@/lib/email/queue"
import { jobEndpoint, workerId as newWorkerId } from "./auth"
import { closeCampaignIfDone } from "@/lib/email/campaign/close"

/**
 * One worker invocation: claim a bounded set of recipients, send them,
 * record what happened, and decide whether to hand over to a successor.
 *
 * ## Why it loops instead of exiting after one claim
 *
 * A 300-second function that sends five emails and exits wastes an
 * invocation and throws away a warm SMTP connection. The loop keeps the
 * pooled connection alive and reuses the warm instance, and stops claiming
 * at 70% of its budget so in-flight sends can finish and be written down
 * before the platform kills it.
 *
 * ## Every outcome is recorded before the next send
 *
 * The window where a crash loses information is one recipient wide. That
 * is the window the lease and UNKNOWN_OUTCOME exist to cover.
 */

export interface WorkerResult {
    campaignId: string
    claimed: number
    submitted: number
    failed: number
    retrying: number
    suppressed: number
    rounds: number
    chained: boolean
    stopped: "done" | "paused" | "deadline" | "budget" | "halted" | "no-work"
    durationMs: number
}

export async function runWorker(input: {
    campaignId: string
    hop?: number
}): Promise<WorkerResult> {
    const startedAt = Date.now()
    const id = newWorkerId()
    const campaignId = new Types.ObjectId(input.campaignId)
    const hop = input.hop ?? 0

    const result: WorkerResult = {
        campaignId: input.campaignId,
        claimed: 0,
        submitted: 0,
        failed: 0,
        retrying: 0,
        suppressed: 0,
        rounds: 0,
        chained: false,
        stopped: "no-work",
        durationMs: 0,
    }

    const campaign = await EmailCampaign.findById(campaignId).lean<IEmailCampaign>()
    if (!campaign) {
        result.durationMs = Date.now() - startedAt
        return result
    }

    const settings = withOverrides(
        await getDeliverySettings(campaign.region),
        campaign.deliveryOverrides
    )
    const deadline = startedAt + claimDeadlineMs(settings)

    // Everything the send loop needs, read once.
    let context: SendContext
    try {
        context = await loadContext(campaign, settings)
    } catch (error) {
        // A missing template or identity is a campaign-level problem, not a
        // recipient one. Halt so somebody looks at it.
        await haltCampaign(campaignId, describe(error))
        result.stopped = "halted"
        result.durationMs = Date.now() - startedAt
        return result
    }

    while (Date.now() < deadline) {
        result.rounds += 1

        // Re-read the status every round, so pause and cancel take effect
        // within one cycle rather than at the end of the campaign.
        const live = await EmailCampaign.findById(campaignId)
            .select("status")
            .lean<{ status: number }>()

        if (!live || live.status !== CAMPAIGN_STATUS.SENDING) {
            result.stopped = "paused"
            break
        }

        if (context.provider.killSwitch) {
            result.stopped = "halted"
            break
        }

        const want = Math.min(
            settings.maxJobsPerInvocation,
            context.provider.globalPerSecond * 2
        )

        const permits = await takePermits({
            providerKey: context.provider.providerKey,
            want,
            perSecond: context.provider.globalPerSecond,
            perDay: context.provider.globalPerDay,
        })

        if (permits.dailyBudgetReached) {
            result.stopped = "budget"
            break
        }

        if (permits.granted === 0) {
            // The second is spent. Wait briefly rather than spinning.
            await sleep(throttleWaitMs())
            continue
        }

        const { jobs, claimId } = await claimRecipients({
            campaignId,
            workerId: id,
            limit: permits.granted,
            leaseMs: settings.leaseDurationMs,
        })

        if (jobs.length === 0) {
            // Nothing to do. Give the permits back so the budget is not
            // charged for sends that never happened.
            await releaseNow(context.provider.providerKey, permits.granted)
            result.stopped = "done"
            break
        }

        // Permits taken but not used, because the claim came back short.
        if (jobs.length < permits.granted) {
            await releaseNow(
                context.provider.providerKey,
                permits.granted - jobs.length
            )
        }

        result.claimed += jobs.length

        const outcome = await sendBatch(jobs, context, settings, id)

        result.submitted += outcome.submitted
        result.failed += outcome.failed
        result.retrying += outcome.retrying
        result.suppressed += outcome.suppressed

        if (outcome.authFailed) {
            /**
             * Give back everything this claim still holds.
             *
             * The batch stops as soon as the first auth failure appears, so
             * most of the claimed rows were never attempted. Leaving them
             * PROCESSING would let their leases expire and the sweeper would
             * park them in UNKNOWN_OUTCOME, which would be a lie: we know
             * exactly what happened to them, which is nothing.
             *
             * releaseClaim only touches rows still PROCESSING under this
             * claim, so the one that actually failed is left alone, and it
             * returns the attempt because no attempt was made.
             */
            await releaseClaim(claimId)

            await haltCampaign(
                campaignId,
                "The mail server refused our sign-in. Check the SMTP password " +
                "in Email Marketing, Settings."
            )
            result.stopped = "halted"
            break
        }

        if (outcome.throttled) {
            // The provider asked us to slow down. Wait out the window
            // rather than claiming again immediately.
            await sleep(throttleWaitMs())
        }

        // A claim that was cancelled mid-flight leaves nothing to do.
        if (outcome.cancelled) {
            await releaseClaim(claimId)
            result.stopped = "paused"
            break
        }
    }

    if (result.stopped === "no-work" && Date.now() >= deadline) {
        result.stopped = "deadline"
    }

    /* ---- Hand over, or close ---- */

    const outstanding = await countOutstanding(campaignId)
    const workLeft = outstanding.claimable + outstanding.retrying

    if (workLeft > 0 && shouldChain(result.stopped)) {
        result.chained = await getQueue().enqueue(
            { campaignId: input.campaignId, reason: "chain", hop: hop + 1 },
            {
                delaySeconds: result.stopped === "budget" ? 3_600 : 1,
                dedupeKey: `${input.campaignId}:chain:${hop + 1}`,
            }
        )
    } else if (workLeft === 0 && outstanding.inFlight === 0) {
        await closeCampaignIfDone(campaignId)
    }

    await EmailCampaign.updateOne(
        { _id: campaignId },
        { $set: { lastWorkerAt: new Date() } }
    )

    result.durationMs = Date.now() - startedAt
    return result
}

/* ------------------------------------------------------------------ */
/* Sending one claimed batch                                           */
/* ------------------------------------------------------------------ */

interface BatchOutcome {
    submitted: number
    failed: number
    retrying: number
    suppressed: number
    authFailed: boolean
    throttled: boolean
    cancelled: boolean
}

async function sendBatch(
    jobs: ICampaignRecipient[],
    context: SendContext,
    settings: DeliverySettings,
    workerId: string
): Promise<BatchOutcome> {
    const outcome: BatchOutcome = {
        submitted: 0,
        failed: 0,
        retrying: 0,
        suppressed: 0,
        authFailed: false,
        throttled: false,
        cancelled: false,
    }

    // A small pool of senders rather than one at a time. More than a
    // couple just queues behind the single SMTP connection.
    const concurrency = Math.max(1, settings.sendConcurrency)
    const queue = [...jobs]

    async function worker(): Promise<void> {
        for (;;) {
            const job = queue.shift()
            if (!job) return
            if (outcome.authFailed) return

            const one = await sendToOne(job, context, settings, workerId)

            if (one === "submitted") outcome.submitted += 1
            else if (one === "failed") outcome.failed += 1
            else if (one === "retrying") outcome.retrying += 1
            else if (one === "suppressed") outcome.suppressed += 1
            else if (one === "auth") {
                outcome.authFailed = true
                return
            } else if (one === "throttled") {
                outcome.throttled = true
                outcome.retrying += 1
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, jobs.length) }, worker)
    )

    return outcome
}

type OneOutcome =
    | "submitted"
    | "failed"
    | "retrying"
    | "suppressed"
    | "throttled"
    | "auth"

async function sendToOne(
    job: ICampaignRecipient,
    context: SendContext,
    settings: DeliverySettings,
    workerId: string
): Promise<OneOutcome> {
    const now = new Date()
    const recipientId = job._id as Types.ObjectId

    /**
     * The suppression recheck.
     *
     * The snapshot was checked when the campaign started, which for a
     * scheduled campaign can be hours ago. Somebody can unsubscribe in
     * that gap, and sending to them is the one mistake that cannot be
     * taken back. One indexed lookup is nothing next to an SMTP round
     * trip.
     */
    if (settings.suppressionRecheckBeforeSend) {
        const suppressed = await EmailSuppression.findOne({
            emailNormalized: job.emailNormalized,
        })
            .select("_id")
            .lean()

        if (suppressed) {
            await CampaignRecipient.updateOne(
                { _id: recipientId },
                {
                    $set: {
                        status: RECIPIENT_STATUS.SUPPRESSED,
                        finishedAt: now,
                        claimId: null,
                        leaseUntil: null,
                        lastError: "Unsubscribed before this campaign sent.",
                    },
                }
            )
            await bumpCounts(job.campaignId as Types.ObjectId, "suppressed")
            return "suppressed"
        }
    }

    /**
     * The Message-ID is written BEFORE the send.
     *
     * If this worker dies on the next line, the id is still on the row and
     * is the only handle on a message that may already have been accepted.
     * See docs/EMAIL_MARKETING_ARCHITECTURE.md section 6.7.
     */
    const messageId = buildMessageId({
        campaignId: job.campaignId as Types.ObjectId,
        recipientId,
        attempt: job.attempts,
        sendingDomain: context.sendingDomain,
    })

    await CampaignRecipient.updateOne(
        { _id: recipientId },
        { $set: { messageId } }
    )

    const attemptStartedAt = new Date()

    try {
        const sent = await sendOne({
            transporter: context.transporter,
            recipient: job,
            campaignId: job.campaignId as Types.ObjectId,
            subject: context.subject,
            html: context.html,
            text: context.text,
            from: context.from,
            replyTo: context.replyTo,
            sendingDomain: context.sendingDomain,
            fallbacks: context.fallbacks,
            unsubscribeUrl: unsubscribeUrlFor(context.origin, job.trackingToken),
            postalAddress: context.postalAddress,
            origin: context.origin,
            trackClicks: context.trackClicks,
            trackOpens: context.trackOpens,
        })

        await CampaignRecipient.updateOne(
            { _id: recipientId },
            {
                $set: {
                    status: RECIPIENT_STATUS.SUBMITTED,
                    submittedAt: now,
                    finishedAt: now,
                    claimId: null,
                    leaseUntil: null,
                    messageId: sent.messageId,
                    lastError: undefined,
                },
            }
        )

        await recordAttempt({
            job,
            workerId,
            attemptStartedAt,
            outcome: ATTEMPT_OUTCOME.ACCEPTED,
            messageId: sent.messageId,
            response: sent.response,
            region: context.region,
        })

        await bumpCounts(job.campaignId as Types.ObjectId, "submitted")
        return "submitted"
    } catch (error) {
        const classified = classifySmtpError(error)
        const allowed = attemptsFor(classified.errorClass, settings)
        const exhausted = job.attempts >= allowed

        await recordAttempt({
            job,
            workerId,
            attemptStartedAt,
            outcome:
                classified.errorClass === ERROR_CLASS.PERMANENT
                    ? ATTEMPT_OUTCOME.REJECTED
                    : ATTEMPT_OUTCOME.ERRORED,
            messageId,
            response: classified.response,
            errorClass: classified.errorClass,
            errorMessage: classified.message,
            smtpCode: classified.smtpCode,
            region: context.region,
        })

        if (classified.errorClass === ERROR_CLASS.AUTH) {
            // Not this recipient's fault. Put them back so they are sent
            // once the password is fixed, and do not burn the attempt.
            await CampaignRecipient.updateOne(
                { _id: recipientId },
                {
                    $set: {
                        status: RECIPIENT_STATUS.QUEUED,
                        claimId: null,
                        leaseUntil: null,
                        lastError: classified.message,
                        lastErrorClass: classified.errorClass,
                    },
                    $inc: { attempts: -1 },
                }
            )
            return "auth"
        }

        if (exhausted) {
            await CampaignRecipient.updateOne(
                { _id: recipientId },
                {
                    $set: {
                        status: RECIPIENT_STATUS.FAILED,
                        finishedAt: now,
                        claimId: null,
                        leaseUntil: null,
                        lastError: classified.message,
                        lastErrorClass: classified.errorClass,
                        lastSmtpCode: classified.smtpCode,
                    },
                }
            )

            if (shouldSuppressOnFailure(classified.errorClass)) {
                await suppressHardBounce(job, classified.message, context.region)
            }

            await bumpCounts(job.campaignId as Types.ObjectId, "failed")
            return "failed"
        }

        await CampaignRecipient.updateOne(
            { _id: recipientId },
            {
                $set: {
                    status: RECIPIENT_STATUS.RETRYING,
                    claimId: null,
                    leaseUntil: null,
                    nextAttemptAt: nextAttemptAt(job.attempts, settings),
                    lastError: classified.message,
                    lastErrorClass: classified.errorClass,
                    lastSmtpCode: classified.smtpCode,
                },
            }
        )

        return classified.errorClass === ERROR_CLASS.THROTTLE
            ? "throttled"
            : "retrying"
    }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface SendContext {
    provider: ProviderWithSecret
    transporter: ReturnType<typeof getTransport>
    subject: string
    html: string
    text: string
    from: { name: string; address: string }
    replyTo?: string
    sendingDomain: string
    postalAddress: string
    fallbacks: Record<string, string>
    origin: string
    region: string
    trackClicks: boolean
    trackOpens: boolean
}

async function loadContext(
    campaign: IEmailCampaign,
    _settings: DeliverySettings
): Promise<SendContext> {
    const provider = await getProviderWithSecret(campaign.region)
    assertSendingAllowed(provider)

    if (!campaign.templateVersionId) {
        throw new Error("This campaign has no template.")
    }

    const version = await EmailTemplateVersion.findById(
        campaign.templateVersionId
    ).lean<IEmailTemplateVersion>()

    if (!version) {
        throw new Error("The campaign's template version is missing.")
    }

    const identity = campaign.senderIdentityId
        ? await EmailSenderIdentity.findById(
              campaign.senderIdentityId
          ).lean<IEmailSenderIdentity>()
        : await EmailSenderIdentity.findOne({ region: campaign.region })
              .sort({ isDefault: -1, createdAt: 1 })
              .lean<IEmailSenderIdentity>()

    if (!identity) {
        throw new Error(
            "This campaign has no sender identity, so there is no address to " +
            "send from."
        )
    }

    const origin =
        process.env.EMAIL_PUBLIC_ORIGIN?.trim().replace(/\/+$/, "") ||
        jobEndpoint("work")?.replace(/\/api\/jobs\/email\/work$/, "") ||
        "http://localhost:3000"

    return {
        provider,
        transporter: getTransport(provider),
        subject: campaign.subject,
        html: version.html,
        text: version.text ?? "",
        from: { name: identity.fromName, address: identity.fromEmail },
        replyTo: identity.replyTo,
        sendingDomain: sendingDomainOf(identity.fromEmail),
        postalAddress: identity.postalAddress,
        fallbacks:
            campaign.mergeFallbacks instanceof Map
                ? Object.fromEntries(campaign.mergeFallbacks.entries())
                : ((campaign.mergeFallbacks ?? {}) as Record<string, string>),
        origin,
        region: campaign.region,

        /**
         * Tracking needs a signing secret. Without EMAIL_TRACKING_SECRET a
         * link would be rewritten through a redirect that then refuses its
         * own signature, so the reader would get a dead link. Better to
         * send an untracked email that works.
         */
        trackClicks: trackingReady(),
        trackOpens: trackingReady(),
    }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

async function recordAttempt(input: {
    job: ICampaignRecipient
    workerId: string
    attemptStartedAt: Date
    outcome: number
    messageId?: string
    response?: string
    errorClass?: ErrorClass
    errorMessage?: string
    smtpCode?: number
    region: string
}): Promise<void> {
    const finishedAt = new Date()

    await EmailDeliveryAttempt.create({
        region: input.region,
        campaignId: input.job.campaignId,
        recipientId: input.job._id,
        attemptNo: input.job.attempts,
        workerId: input.workerId,
        startedAt: input.attemptStartedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - input.attemptStartedAt.getTime(),
        outcome: input.outcome,
        smtpCode: input.smtpCode,
        smtpResponse: input.response,
        errorClass: input.errorClass,
        errorMessage: input.errorMessage,
        messageId: input.messageId,
        // 90 days. This is our only log: Vercel Hobby keeps runtime logs
        // for one hour.
        expiresAt: new Date(finishedAt.getTime() + 90 * 24 * 60 * 60 * 1_000),
    })
}

/** A hard bounce means the address is wrong and always will be. */
async function suppressHardBounce(
    job: ICampaignRecipient,
    reason: string,
    region: string
): Promise<void> {
    await EmailSuppression.updateOne(
        { region, emailNormalized: job.emailNormalized },
        {
            $setOnInsert: {
                region,
                emailNormalized: job.emailNormalized,
                email: job.email,
                reason: SUPPRESSION_REASON.HARD_BOUNCE,
                note: reason.slice(0, 1000),
                sourceCampaignId: job.campaignId,
            },
        },
        { upsert: true }
    )
}

type CountField = "submitted" | "failed" | "suppressed" | "bounced"

async function bumpCounts(
    campaignId: Types.ObjectId,
    field: CountField
): Promise<void> {
    await EmailCampaign.updateOne(
        { _id: campaignId },
        { $inc: { [`counts.${field}`]: 1, "counts.queued": -1 } }
    )
}

async function haltCampaign(
    campaignId: Types.ObjectId,
    reason: string
): Promise<void> {
    await EmailCampaign.updateOne(
        { _id: campaignId, status: CAMPAIGN_STATUS.SENDING },
        {
            $set: {
                status: CAMPAIGN_STATUS.HALTED,
                haltedReason: reason,
                haltedAt: new Date(),
            },
        }
    )
}

/** Whether a stop reason means more work should be handed to a successor. */
function shouldChain(stopped: WorkerResult["stopped"]): boolean {
    return stopped === "deadline" || stopped === "budget"
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : "The campaign could not start."
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
