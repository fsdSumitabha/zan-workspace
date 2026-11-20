import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { SUPPRESSION_REASONS } from "@/constants/emailStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * The do-not-send list. Small, boring, and the most important collection
 * here for staying out of trouble.
 *
 * ## Never put a TTL on this
 *
 * An unsubscribe is permanent. A suppression row that expires means we
 * email somebody who asked us not to. That is a legal problem, not a
 * storage saving.
 *
 * ## Checked twice
 *
 * Once when the recipient snapshot is built, and again in the worker right
 * before sendMail. The gap between the two can be hours for a scheduled
 * campaign, and somebody can unsubscribe inside it. The second check is one
 * indexed lookup, which is nothing next to an SMTP round trip.
 */
export interface IEmailSuppression extends Document {
    region: RegionCode
    /** Lowercase and trimmed. */
    emailNormalized: string
    /** The address as it was when it was suppressed, for display. */
    email: string
    reason: number
    /** Which campaign caused it, for an unsubscribe or a bounce. */
    sourceCampaignId?: Types.ObjectId | null
    /** The provider's bounce text, or a person's note. */
    note?: string
    addedBy?: Types.ObjectId
    createdAt: Date
    updatedAt: Date
}

const EmailSuppressionSchema = new Schema<IEmailSuppression>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
        },
        emailNormalized: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        email: { type: String, required: true, trim: true },
        reason: { type: Number, enum: SUPPRESSION_REASONS, required: true },
        sourceCampaignId: {
            type: Schema.Types.ObjectId,
            ref: "EmailCampaign",
            default: null,
        },
        note: { type: String, maxlength: 1000 },
        addedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

// The check before every send, and the guard against adding a duplicate.
EmailSuppressionSchema.index({ region: 1, emailNormalized: 1 }, { unique: true })

// The suppression screen: filter by reason, newest first.
EmailSuppressionSchema.index({ region: 1, reason: 1, createdAt: -1 })

// No softDeletePlugin. Removing a suppression is a real delete, done by an
// admin from the suppression screen, and the audit log records it.
ensureAuditPlugin(EmailSuppressionSchema, ENTITY_TYPE.EMAIL_SUPPRESSION)
regionScopePlugin(EmailSuppressionSchema)

const EmailSuppression =
    (mongoose.models.EmailSuppression as mongoose.Model<IEmailSuppression>) ||
    mongoose.model<IEmailSuppression>("EmailSuppression", EmailSuppressionSchema)

ensureAuditPlugin(EmailSuppression.schema, ENTITY_TYPE.EMAIL_SUPPRESSION)
regionScopePlugin(EmailSuppression.schema)

export default EmailSuppression
