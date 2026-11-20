import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { RECIPIENT_STATUS, RECIPIENT_STATUSES } from "@/constants/emailStatus"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One recipient of one campaign. This is the job unit.
 *
 * It is what a worker claims, leases, sends, retries and reports on. One
 * row per person per campaign. Nothing about a recipient is embedded in the
 * campaign document, so a campaign never grows with its audience.
 *
 * ## Why the identity is copied in here
 *
 * `email`, `name` and `mergeData` are a snapshot taken when the campaign
 * starts. They are never read back from the Lead or Client at send time.
 *
 * Two reasons. First, the recipient count a person approved must be the
 * count that is sent; editing a lead tomorrow must not change a campaign
 * scheduled yesterday. Second, it is one database read at snapshot instead
 * of one per send.
 *
 * ## No soft delete, no audit plugin
 *
 * These rows are written by workers, not by people. There is nothing for an
 * activity log to say about them, and a deleted one would break the
 * campaign's counts. They are deleted only with their campaign.
 */
export interface ICampaignRecipient extends Document {
    region: RegionCode
    campaignId: Types.ObjectId
    /** Optional. Batches are not built yet. See the decisions document. */
    batchId?: Types.ObjectId | null

    /** As it was entered, for display. */
    email: string
    /** Lowercase and trimmed. The deduplication key. */
    emailNormalized: string
    name?: string
    /** RECIPIENT_SOURCE. Lets a report link back to the CRM record. */
    sourceType: number
    sourceId?: Types.ObjectId | null

    /** Merge values, frozen at snapshot time. Capped at 20 keys. */
    mergeData: Map<string, string>

    status: number
    attempts: number
    maxAttempts: number

    /**
     * The lease. Only meaningful while status is PROCESSING.
     *
     * `claimId` is how a worker learns which rows it actually won:
     * updateMany does not return the documents it changed, so the worker
     * stamps a claim id and then queries it. See
     * docs/EMAIL_MARKETING_ARCHITECTURE.md section 6.3.
     */
    claimId?: Types.ObjectId | null
    leaseOwner?: string
    leaseUntil?: Date | null

    /**
     * Written BEFORE the send, not after.
     *
     * If the worker dies between the SMTP accept and the database write,
     * this id is still here. It is the only handle we have on a message
     * whose outcome is unknown. A provider that can look a message up by id
     * can then resolve UNKNOWN_OUTCOME for certain.
     */
    messageId?: string

    lastError?: string
    lastErrorClass?: number
    lastSmtpCode?: number
    /** When a RETRYING row becomes claimable again. */
    nextAttemptAt?: Date | null

    queuedAt?: Date
    lastAttemptAt?: Date
    submittedAt?: Date
    deliveredAt?: Date
    finishedAt?: Date

    /** HMAC, used in the pixel and click URLs. Never an ObjectId. */
    trackingToken?: string

    openCount: number
    clickCount: number
    firstOpenAt?: Date
    firstClickAt?: Date
    unsubscribedAt?: Date | null

    createdAt: Date
    updatedAt: Date
}

const CampaignRecipientSchema = new Schema<ICampaignRecipient>(
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
        batchId: { type: Schema.Types.ObjectId, default: null },

        email: { type: String, required: true, trim: true },
        emailNormalized: { type: String, required: true, lowercase: true, trim: true },
        name: String,
        sourceType: { type: Number, required: true },
        sourceId: { type: Schema.Types.ObjectId, default: null },

        mergeData: { type: Map, of: String, default: {} },

        status: {
            type: Number,
            enum: RECIPIENT_STATUSES,
            default: RECIPIENT_STATUS.PENDING,
            required: true,
        },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 5 },

        claimId: { type: Schema.Types.ObjectId, default: null },
        leaseOwner: String,
        leaseUntil: { type: Date, default: null },

        messageId: String,

        lastError: String,
        lastErrorClass: Number,
        lastSmtpCode: Number,
        nextAttemptAt: { type: Date, default: null },

        queuedAt: Date,
        lastAttemptAt: Date,
        submittedAt: Date,
        deliveredAt: Date,
        finishedAt: Date,

        trackingToken: String,

        openCount: { type: Number, default: 0 },
        clickCount: { type: Number, default: 0 },
        firstOpenAt: Date,
        firstClickAt: Date,
        unsubscribedAt: { type: Date, default: null },
    },
    { timestamps: true }
)

/**
 * The claim query. This is the hot path; everything else is secondary.
 * `_id` is in the key so the sort that picks candidates is covered.
 */
CampaignRecipientSchema.index({ campaignId: 1, status: 1, _id: 1 })

/**
 * Deduplication. Unique, so an unordered bulk insert skips a repeat instead
 * of failing the whole batch. This index must exist before the first
 * snapshot runs, or duplicates get in and it can never be built afterwards
 * without cleaning rows. Run `npm run db:indexes` after deploying.
 */
CampaignRecipientSchema.index({ campaignId: 1, emailNormalized: 1 }, { unique: true })

// The sweeper: PROCESSING rows whose lease has died.
CampaignRecipientSchema.index({ status: 1, leaseUntil: 1 })

// Retry pickup: RETRYING rows whose backoff has elapsed.
CampaignRecipientSchema.index({ status: 1, nextAttemptAt: 1 })

// Pixel and click lookup. Sparse: a row has no token until it is prepared.
CampaignRecipientSchema.index({ trackingToken: 1 }, { unique: true, sparse: true })

// "Which campaigns went to this person?", on a lead or client page.
CampaignRecipientSchema.index({ region: 1, emailNormalized: 1, createdAt: -1 })

// The recipients tab, filtered by status, newest finished first.
CampaignRecipientSchema.index({ campaignId: 1, status: 1, finishedAt: -1 })

// No softDeletePlugin and no ensureAuditPlugin here. See the note above.
regionScopePlugin(CampaignRecipientSchema)

const CampaignRecipient =
    (mongoose.models.CampaignRecipient as mongoose.Model<ICampaignRecipient>) ||
    mongoose.model<ICampaignRecipient>("CampaignRecipient", CampaignRecipientSchema)

regionScopePlugin(CampaignRecipient.schema)

export default CampaignRecipient
