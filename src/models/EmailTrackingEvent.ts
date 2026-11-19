import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { TRACKING_EVENTS } from "@/constants/emailStatus"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One tracking event: an open, a click, a bounce, a complaint or an
 * unsubscribe.
 *
 * ## Separate collection, never embedded
 *
 * A campaign document must not grow with its engagement. The aggregate
 * counts live on CampaignRecipient and EmailCampaign and are kept with
 * $inc, so a report never scans this collection.
 *
 * ## The IP is hashed, not stored
 *
 * We do not need to know where somebody read an email, and keeping it
 * would be a DPDP liability for no product value. `ipHash` exists only to
 * tell two opens apart.
 *
 * ## Opens are wrong and we say so
 *
 * Apple Mail Privacy Protection and corporate image proxies fetch the
 * pixel with no human involved. Image blocking hides real opens. The
 * numbers are directionally useful and numerically wrong, and the UI says
 * that next to them.
 */
export interface IEmailTrackingEvent extends Document {
    region: RegionCode
    campaignId: Types.ObjectId
    recipientId: Types.ObjectId

    type: number
    at: Date

    /** Clicks only. The destination that was allowed. */
    url?: string
    /** SHA-256 of the IP plus a salt. Never the raw address. */
    ipHash?: string
    userAgent?: string

    /** The provider's own id, from a webhook. */
    providerMessageId?: string
    /** The webhook body, for bounces, so a reason can be read later. */
    raw?: Record<string, unknown>

    /** TTL. Set to at + 365 days when the row is written. */
    expiresAt: Date

    createdAt: Date
    updatedAt: Date
}

const EmailTrackingEventSchema = new Schema<IEmailTrackingEvent>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
        },
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: "EmailCampaign",
            required: true,
        },
        recipientId: {
            type: Schema.Types.ObjectId,
            ref: "CampaignRecipient",
            required: true,
        },

        type: { type: Number, enum: TRACKING_EVENTS, required: true },
        at: { type: Date, required: true, default: Date.now },

        url: { type: String, maxlength: 2000 },
        ipHash: String,
        userAgent: { type: String, maxlength: 500 },

        providerMessageId: String,
        raw: { type: Schema.Types.Mixed },

        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
)

// The analytics tab: a campaign, one event type, newest first.
EmailTrackingEventSchema.index({ campaignId: 1, type: 1, at: -1 })

// One recipient's engagement history.
EmailTrackingEventSchema.index({ recipientId: 1, at: -1 })

// Matching a provider webhook back to a recipient. Sparse: only webhook
// events carry a provider id.
EmailTrackingEventSchema.index({ providerMessageId: 1 }, { sparse: true })

EmailTrackingEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

regionScopePlugin(EmailTrackingEventSchema)

const EmailTrackingEvent =
    (mongoose.models.EmailTrackingEvent as mongoose.Model<IEmailTrackingEvent>) ||
    mongoose.model<IEmailTrackingEvent>(
        "EmailTrackingEvent",
        EmailTrackingEventSchema
    )

regionScopePlugin(EmailTrackingEvent.schema)

export default EmailTrackingEvent
