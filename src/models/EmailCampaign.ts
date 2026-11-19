import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { CAMPAIGN_STATUS, CAMPAIGN_STATUSES } from "@/constants/emailStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * One marketing campaign.
 *
 * It holds what to send, who to send it to, and when. It does NOT hold the
 * recipients. Those are rows in CampaignRecipient, one per person, because
 * they are the unit that is claimed, leased, retried and reported. See
 * docs/EMAIL_MARKETING_DATABASE_SCHEMA.md.
 *
 * MongoDB is the authoritative schedule. Nothing else holds it. A campaign
 * set for six weeks away just sits here until `scheduledAt` passes, and no
 * queue message has to stay alive in the meantime.
 */

export interface ICampaignCounts {
    total: number
    pending: number
    queued: number
    processing: number
    submitted: number
    delivered: number
    failed: number
    bounced: number
    suppressed: number
    cancelled: number
    unknown: number
}

export interface ICampaignEngagement {
    uniqueOpens: number
    totalOpens: number
    uniqueClicks: number
    totalClicks: number
    unsubscribes: number
    complaints: number
}

export interface IEmailCampaign extends Document {
    region: RegionCode

    name: string
    description?: string
    status: number

    // Content
    subject: string
    preheader?: string
    templateId?: Types.ObjectId
    /**
     * Pinned, not the template id. Editing a template after a campaign is
     * scheduled must not change what that campaign sends.
     */
    templateVersionId?: Types.ObjectId
    senderIdentityId?: Types.ObjectId
    /** Merge token -> what to print when the recipient has no value. */
    mergeFallbacks: Map<string, string>

    // Audience
    audienceId?: Types.ObjectId
    /** A copy of the audience rules at schedule time, for the report. */
    audienceSnapshot?: Record<string, unknown>

    /**
     * The schedule, in three fields.
     *
     * `scheduledAt` is UTC and is the only one any query reads. The other
     * two keep what the person actually chose, so the UI can show
     * "9:30 AM IST" later without guessing, and a reschedule starts from
     * what they meant. See docs/time-zones.md.
     */
    scheduledAt?: Date | null
    /** "2026-12-01T09:30". No zone, no seconds. */
    scheduleWall?: string
    /** IANA name, for example "Asia/Kolkata". */
    scheduleZone?: string
    sendImmediately: boolean

    /**
     * Denormalised counters, kept with $inc so reports do not aggregate
     * every recipient row. They can drift if a worker dies between the
     * recipient write and the counter write, so `recountCampaign` rebuilds
     * them from CampaignRecipient when a campaign closes. The recipient
     * rows are the truth; these are for speed.
     */
    counts: ICampaignCounts
    engagement: ICampaignEngagement

    // Lifecycle
    startedAt?: Date
    finishedAt?: Date
    /** Why the safety system stopped it. Only set when status is HALTED. */
    haltedReason?: string
    haltedAt?: Date
    pausedBy?: Types.ObjectId
    pausedAt?: Date
    cancelledBy?: Types.ObjectId
    cancelledAt?: Date
    /** Why the snapshot could not be built. Only set when status is FAILED. */
    failureReason?: string

    // Approval. The fields exist from day one so the workflow can be
    // switched on later without a migration.
    approvalRequired: boolean
    approvedBy?: Types.ObjectId
    approvedAt?: Date

    /** Per-campaign overrides of EmailDeliveryConfig. Usually empty. */
    deliveryOverrides?: Map<string, number>

    /** Set while a worker is actively sending, so the UI can show it. */
    lastWorkerAt?: Date

    createdBy?: Types.ObjectId
    archivedAt?: Date | null
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const CountsSchema = new Schema<ICampaignCounts>(
    {
        total: { type: Number, default: 0 },
        pending: { type: Number, default: 0 },
        queued: { type: Number, default: 0 },
        processing: { type: Number, default: 0 },
        submitted: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        bounced: { type: Number, default: 0 },
        suppressed: { type: Number, default: 0 },
        cancelled: { type: Number, default: 0 },
        unknown: { type: Number, default: 0 },
    },
    { _id: false }
)

const EngagementSchema = new Schema<ICampaignEngagement>(
    {
        uniqueOpens: { type: Number, default: 0 },
        totalOpens: { type: Number, default: 0 },
        uniqueClicks: { type: Number, default: 0 },
        totalClicks: { type: Number, default: 0 },
        unsubscribes: { type: Number, default: 0 },
        complaints: { type: Number, default: 0 },
    },
    { _id: false }
)

const EmailCampaignSchema = new Schema<IEmailCampaign>(
    {
        // Required from the start. This model is new, so there are no old
        // rows to backfill. regionScopePlugin stamps it on create.
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        name: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, maxlength: 1000 },

        status: {
            type: Number,
            enum: CAMPAIGN_STATUSES,
            default: CAMPAIGN_STATUS.DRAFT,
            required: true,
        },

        subject: { type: String, default: "", trim: true, maxlength: 300 },
        preheader: { type: String, maxlength: 300 },
        templateId: { type: Schema.Types.ObjectId, ref: "EmailTemplate" },
        templateVersionId: { type: Schema.Types.ObjectId, ref: "EmailTemplateVersion" },
        senderIdentityId: { type: Schema.Types.ObjectId, ref: "EmailSenderIdentity" },
        mergeFallbacks: { type: Map, of: String, default: {} },

        audienceId: { type: Schema.Types.ObjectId, ref: "EmailAudience" },
        audienceSnapshot: { type: Schema.Types.Mixed },

        scheduledAt: { type: Date, default: null },
        scheduleWall: { type: String, match: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ },
        scheduleZone: { type: String },
        sendImmediately: { type: Boolean, default: false },

        counts: { type: CountsSchema, default: () => ({}) },
        engagement: { type: EngagementSchema, default: () => ({}) },

        startedAt: Date,
        finishedAt: Date,
        haltedReason: String,
        haltedAt: Date,
        pausedBy: { type: Schema.Types.ObjectId, ref: "User" },
        pausedAt: Date,
        cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
        cancelledAt: Date,
        failureReason: String,

        approvalRequired: { type: Boolean, default: false },
        approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
        approvedAt: Date,

        deliveryOverrides: { type: Map, of: Number },

        lastWorkerAt: Date,

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        archivedAt: { type: Date, default: null },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

/**
 * The dispatcher's query: which campaigns are due right now.
 *
 * Deliberately NOT prefixed with `region`. The dispatcher is a system
 * process, not a signed-in person. It runs inside runWithoutRegionScope and
 * must see due campaigns in every region in one query.
 */
EmailCampaignSchema.index({ status: 1, scheduledAt: 1 })

// The campaign list: a region, a status tab, newest first.
EmailCampaignSchema.index({ region: 1, status: 1, createdAt: -1 })

// "My campaigns", for somebody who may only see their own.
EmailCampaignSchema.index({ region: 1, createdBy: 1, createdAt: -1 })

// Name search and the duplicate-name check.
EmailCampaignSchema.index({ region: 1, name: 1 })

softDeletePlugin(EmailCampaignSchema)
ensureAuditPlugin(EmailCampaignSchema, ENTITY_TYPE.EMAIL_CAMPAIGN)
regionScopePlugin(EmailCampaignSchema)

const EmailCampaign =
    (mongoose.models.EmailCampaign as mongoose.Model<IEmailCampaign>) ||
    mongoose.model<IEmailCampaign>("EmailCampaign", EmailCampaignSchema)

softDeletePlugin(EmailCampaign.schema)
ensureAuditPlugin(EmailCampaign.schema, ENTITY_TYPE.EMAIL_CAMPAIGN)
regionScopePlugin(EmailCampaign.schema)

export default EmailCampaign
