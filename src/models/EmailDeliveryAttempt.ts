import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ATTEMPT_OUTCOME } from "@/constants/emailStatus"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One send attempt and what the SMTP server said.
 *
 * ## This matters more on the Hobby plan, not less
 *
 * Vercel Hobby keeps runtime logs for one hour. A campaign that ran this
 * morning has no platform logs left. This collection is our own log, it
 * lives in MongoDB, and it keeps 90 days. It is the Delivery Activity
 * screen's data source and the raw material for the latency percentiles.
 *
 * ## Why it is not an array on the recipient
 *
 * Five attempts embedded would be fine. An unbounded array is not, and an
 * embedded array cannot have a TTL. Here, old rows clean themselves up and
 * the aggregate counts on CampaignRecipient survive them.
 */
export interface IEmailDeliveryAttempt extends Document {
    region: RegionCode
    campaignId: Types.ObjectId
    recipientId: Types.ObjectId
    attemptNo: number

    /** Which worker invocation ran it. Matches CampaignRecipient.leaseOwner. */
    workerId: string

    startedAt: Date
    finishedAt?: Date
    durationMs?: number

    outcome: number
    smtpCode?: number
    /** The server's own words, trimmed. Shown verbatim in the UI. */
    smtpResponse?: string
    errorClass?: number
    errorMessage?: string
    /** The Message-ID we generated before sending. */
    messageId?: string

    /** TTL. Set to startedAt + 90 days when the row is written. */
    expiresAt: Date

    createdAt: Date
    updatedAt: Date
}

const EmailDeliveryAttemptSchema = new Schema<IEmailDeliveryAttempt>(
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
        attemptNo: { type: Number, required: true, min: 1 },

        workerId: { type: String, required: true },

        startedAt: { type: Date, required: true },
        finishedAt: Date,
        durationMs: Number,

        outcome: {
            type: Number,
            default: ATTEMPT_OUTCOME.ERRORED,
            required: true,
        },
        smtpCode: Number,
        smtpResponse: { type: String, maxlength: 2000 },
        errorClass: Number,
        errorMessage: { type: String, maxlength: 2000 },
        messageId: String,

        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
)

// One recipient's history, oldest attempt first.
EmailDeliveryAttemptSchema.index({ recipientId: 1, attemptNo: 1 })

// The Delivery Activity screen: a campaign, an outcome, newest first.
EmailDeliveryAttemptSchema.index({ campaignId: 1, outcome: 1, startedAt: -1 })

// Across every campaign, newest first. The unfiltered operations view.
EmailDeliveryAttemptSchema.index({ region: 1, startedAt: -1 })

// MongoDB deletes the row when expiresAt passes. No cleanup job to forget.
EmailDeliveryAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

regionScopePlugin(EmailDeliveryAttemptSchema)

const EmailDeliveryAttempt =
    (mongoose.models.EmailDeliveryAttempt as mongoose.Model<IEmailDeliveryAttempt>) ||
    mongoose.model<IEmailDeliveryAttempt>(
        "EmailDeliveryAttempt",
        EmailDeliveryAttemptSchema
    )

regionScopePlugin(EmailDeliveryAttempt.schema)

export default EmailDeliveryAttempt
