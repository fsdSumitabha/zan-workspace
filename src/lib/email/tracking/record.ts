import type { Types } from "mongoose"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import EmailCampaign from "@/models/EmailCampaign"
import EmailTrackingEvent from "@/models/EmailTrackingEvent"
import EmailSuppression from "@/models/EmailSuppression"
import EmailContact from "@/models/EmailContact"
import {
    RECIPIENT_STATUS,
    SUPPRESSION_REASON,
    TRACKING_EVENT,
    type TrackingEvent,
} from "@/constants/emailStatus"

/**
 * Writing what a reader did, and keeping the headline numbers fast.
 *
 * ## Two places, on purpose
 *
 * The event goes into EmailTrackingEvent, which has a TTL and can grow
 * without bound in the meantime. The counts go onto the recipient and the
 * campaign with `$inc`, so a report never aggregates a million rows to
 * draw one number.
 *
 * It follows that a year-old open event expiring does not change last
 * year's open rate: the rate is computed from counters that never expire.
 *
 * ## Unique versus total
 *
 * "Unique opens" is the number of recipients whose `openCount` went from
 * zero to one. That is why the recipient update happens first and its
 * result decides whether the campaign's unique counter moves.
 */

const EVENT_TTL_DAYS = 365

export interface RecordInput {
    recipient: Pick<
        ICampaignRecipient,
        "_id" | "campaignId" | "region" | "email" | "emailNormalized"
    >
    type: TrackingEvent
    /** Clicks only. */
    url?: string
    ipHash?: string
    userAgent?: string
    providerMessageId?: string
    raw?: Record<string, unknown>
    at?: Date
}

export async function recordEvent(input: RecordInput): Promise<void> {
    const at = input.at ?? new Date()
    const recipientId = input.recipient._id as Types.ObjectId
    const campaignId = input.recipient.campaignId as Types.ObjectId

    await EmailTrackingEvent.create({
        region: input.recipient.region,
        campaignId,
        recipientId,
        type: input.type,
        at,
        url: input.url?.slice(0, 2_000),
        ipHash: input.ipHash,
        userAgent: input.userAgent?.slice(0, 500),
        providerMessageId: input.providerMessageId,
        raw: input.raw,
        expiresAt: new Date(at.getTime() + EVENT_TTL_DAYS * 24 * 60 * 60 * 1_000),
    })

    switch (input.type) {
        case TRACKING_EVENT.OPEN:
            await bumpOpen(recipientId, campaignId, at)
            break
        case TRACKING_EVENT.CLICK:
            await bumpClick(recipientId, campaignId, at)
            break
        case TRACKING_EVENT.DELIVERED:
            await markDelivered(recipientId, campaignId, at)
            break
        case TRACKING_EVENT.BOUNCE_HARD:
            await markBounced(input, campaignId, at, true)
            break
        case TRACKING_EVENT.BOUNCE_SOFT:
            await markBounced(input, campaignId, at, false)
            break
        case TRACKING_EVENT.COMPLAINT:
            await markComplaint(input, campaignId)
            break
        case TRACKING_EVENT.UNSUBSCRIBE:
            await markUnsubscribed(input, campaignId, at)
            break
    }
}

/* ------------------------------------------------------------------ */

async function bumpOpen(
    recipientId: Types.ObjectId,
    campaignId: Types.ObjectId,
    at: Date
): Promise<void> {
    // Guarded on openCount 0, so this matches only the first open. The
    // result is what tells us whether the unique counter should move.
    const first = await CampaignRecipient.updateOne(
        { _id: recipientId, openCount: 0 },
        { $set: { firstOpenAt: at }, $inc: { openCount: 1 } }
    )

    if (first.modifiedCount > 0) {
        await EmailCampaign.updateOne(
            { _id: campaignId },
            {
                $inc: {
                    "engagement.uniqueOpens": 1,
                    "engagement.totalOpens": 1,
                },
            }
        )
        return
    }

    await CampaignRecipient.updateOne(
        { _id: recipientId },
        { $inc: { openCount: 1 } }
    )
    await EmailCampaign.updateOne(
        { _id: campaignId },
        { $inc: { "engagement.totalOpens": 1 } }
    )
}

async function bumpClick(
    recipientId: Types.ObjectId,
    campaignId: Types.ObjectId,
    at: Date
): Promise<void> {
    const first = await CampaignRecipient.updateOne(
        { _id: recipientId, clickCount: 0 },
        { $set: { firstClickAt: at }, $inc: { clickCount: 1 } }
    )

    if (first.modifiedCount > 0) {
        await EmailCampaign.updateOne(
            { _id: campaignId },
            {
                $inc: {
                    "engagement.uniqueClicks": 1,
                    "engagement.totalClicks": 1,
                },
            }
        )
        return
    }

    await CampaignRecipient.updateOne(
        { _id: recipientId },
        { $inc: { clickCount: 1 } }
    )
    await EmailCampaign.updateOne(
        { _id: campaignId },
        { $inc: { "engagement.totalClicks": 1 } }
    )
}

/**
 * The provider confirmed the mail arrived.
 *
 * Guarded on SUBMITTED, so a late or repeated webhook cannot move a
 * recipient that has since bounced back to delivered.
 */
async function markDelivered(
    recipientId: Types.ObjectId,
    campaignId: Types.ObjectId,
    at: Date
): Promise<void> {
    const moved = await CampaignRecipient.updateOne(
        { _id: recipientId, status: RECIPIENT_STATUS.SUBMITTED },
        { $set: { status: RECIPIENT_STATUS.DELIVERED, deliveredAt: at } }
    )

    if (moved.modifiedCount > 0) {
        await EmailCampaign.updateOne(
            { _id: campaignId },
            { $inc: { "counts.delivered": 1, "counts.submitted": -1 } }
        )
    }
}

async function markBounced(
    input: RecordInput,
    campaignId: Types.ObjectId,
    at: Date,
    hard: boolean
): Promise<void> {
    const recipientId = input.recipient._id as Types.ObjectId

    const moved = await CampaignRecipient.updateOne(
        {
            _id: recipientId,
            status: {
                $in: [RECIPIENT_STATUS.SUBMITTED, RECIPIENT_STATUS.DELIVERED],
            },
        },
        {
            $set: {
                status: RECIPIENT_STATUS.BOUNCED,
                finishedAt: at,
                lastError: hard
                    ? "The provider reported a hard bounce."
                    : "The provider reported a soft bounce.",
            },
        }
    )

    if (moved.modifiedCount > 0) {
        await EmailCampaign.updateOne(
            { _id: campaignId },
            { $inc: { "counts.bounced": 1, "counts.submitted": -1 } }
        )
    }

    /**
     * Only a hard bounce suppresses.
     *
     * A soft bounce is a full mailbox or a server having a bad day. Adding
     * those to a permanent do-not-send list would quietly shrink every
     * future audience for no good reason.
     */
    if (hard) {
        await suppress(
            input,
            SUPPRESSION_REASON.HARD_BOUNCE,
            "The provider reported a hard bounce.",
            campaignId
        )
    }
}

async function markComplaint(
    input: RecordInput,
    campaignId: Types.ObjectId
): Promise<void> {
    await EmailCampaign.updateOne(
        { _id: campaignId },
        { $inc: { "engagement.complaints": 1 } }
    )

    // Somebody pressed "this is spam". Never email them again.
    await suppress(
        input,
        SUPPRESSION_REASON.COMPLAINT,
        "This person marked a campaign as spam.",
        campaignId
    )
}

async function markUnsubscribed(
    input: RecordInput,
    campaignId: Types.ObjectId,
    at: Date
): Promise<void> {
    await CampaignRecipient.updateOne(
        { _id: input.recipient._id },
        { $set: { unsubscribedAt: at } }
    )

    await EmailCampaign.updateOne(
        { _id: campaignId },
        { $inc: { "engagement.unsubscribes": 1 } }
    )

    await suppress(
        input,
        SUPPRESSION_REASON.UNSUBSCRIBED,
        "Unsubscribed from a campaign.",
        campaignId
    )

    // A stored contact also has its consent withdrawn, so the contacts
    // screen shows the truth rather than a tick next to somebody who has
    // asked to be left alone.
    await EmailContact.updateOne(
        {
            region: input.recipient.region,
            emailNormalized: input.recipient.emailNormalized,
        },
        { $set: { marketingConsent: false, consentWithdrawnAt: at } }
    )
}

async function suppress(
    input: RecordInput,
    reason: number,
    note: string,
    campaignId: Types.ObjectId
): Promise<void> {
    await EmailSuppression.updateOne(
        {
            region: input.recipient.region,
            emailNormalized: input.recipient.emailNormalized,
        },
        {
            $setOnInsert: {
                region: input.recipient.region,
                emailNormalized: input.recipient.emailNormalized,
                email: input.recipient.email,
                reason,
                note,
                sourceCampaignId: campaignId,
            },
        },
        { upsert: true }
    )
}

/**
 * Finds a recipient by the token in a tracking URL.
 *
 * Returns null for anything unknown. Every caller then behaves exactly as
 * it would for a real token, because a route that answers differently for
 * a valid and an invalid token is a way to test tokens.
 */
export async function recipientByToken(
    token: string
): Promise<ICampaignRecipient | null> {
    if (!token || token.length < 16 || token.length > 64) return null
    if (!/^[a-f0-9]+$/i.test(token)) return null

    return CampaignRecipient.findOne({ trackingToken: token })
        .lean<ICampaignRecipient>()
}
