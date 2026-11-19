import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * A reusable audience definition.
 *
 * ## The rules are a closed shape, not a query
 *
 * Nothing a person types becomes a Mongo operator. The resolver reads each
 * named field and builds the filter itself. A saved audience cannot carry
 * `$where` or `$expr` into a query, because there is nowhere to put them.
 *
 * ## It is a definition, not a list
 *
 * `lastCount` is a convenience for the list screen and goes stale. The
 * recipients a campaign actually sends to are frozen into
 * CampaignRecipient rows when the campaign starts, and never read from
 * here again.
 */

export interface IAudienceLeadRules {
    all?: boolean
    ids?: Types.ObjectId[]
    status?: number[]
    source?: string[]
    assignedTo?: Types.ObjectId[]
}

export interface IAudienceClientRules {
    all?: boolean
    ids?: Types.ObjectId[]
    status?: number[]
}

export interface IAudienceContactRules {
    all?: boolean
    ids?: Types.ObjectId[]
    tags?: string[]
}

export interface IAudienceRules {
    leads?: IAudienceLeadRules
    clients?: IAudienceClientRules
    contacts?: IAudienceContactRules
    /** Addresses typed or pasted straight into the audience. */
    manual?: string[]
    exclude?: {
        emails?: string[]
        audienceIds?: Types.ObjectId[]
    }
}

export interface IEmailAudience extends Document {
    region: RegionCode
    name: string
    description?: string
    rules: IAudienceRules

    /** Stale by design. For the list screen only. */
    lastCount?: number
    lastCountedAt?: Date

    createdBy?: Types.ObjectId
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const LeadRulesSchema = new Schema<IAudienceLeadRules>(
    {
        all: Boolean,
        ids: [{ type: Schema.Types.ObjectId, ref: "Lead" }],
        status: [Number],
        source: [String],
        assignedTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
    },
    { _id: false }
)

const ClientRulesSchema = new Schema<IAudienceClientRules>(
    {
        all: Boolean,
        ids: [{ type: Schema.Types.ObjectId, ref: "Client" }],
        status: [Number],
    },
    { _id: false }
)

const ContactRulesSchema = new Schema<IAudienceContactRules>(
    {
        all: Boolean,
        ids: [{ type: Schema.Types.ObjectId, ref: "EmailContact" }],
        tags: [String],
    },
    { _id: false }
)

const RulesSchema = new Schema<IAudienceRules>(
    {
        leads: { type: LeadRulesSchema },
        clients: { type: ClientRulesSchema },
        contacts: { type: ContactRulesSchema },
        manual: { type: [String], default: undefined },
        exclude: {
            type: new Schema(
                {
                    emails: { type: [String], default: undefined },
                    audienceIds: [{ type: Schema.Types.ObjectId, ref: "EmailAudience" }],
                },
                { _id: false }
            ),
        },
    },
    { _id: false }
)

const EmailAudienceSchema = new Schema<IEmailAudience>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },
        name: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, maxlength: 1000 },
        rules: { type: RulesSchema, default: () => ({}) },

        lastCount: Number,
        lastCountedAt: Date,

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

EmailAudienceSchema.index({ region: 1, name: 1 })
EmailAudienceSchema.index({ region: 1, updatedAt: -1 })

softDeletePlugin(EmailAudienceSchema)
ensureAuditPlugin(EmailAudienceSchema, ENTITY_TYPE.EMAIL_AUDIENCE)
regionScopePlugin(EmailAudienceSchema)

const EmailAudience =
    (mongoose.models.EmailAudience as mongoose.Model<IEmailAudience>) ||
    mongoose.model<IEmailAudience>("EmailAudience", EmailAudienceSchema)

softDeletePlugin(EmailAudience.schema)
ensureAuditPlugin(EmailAudience.schema, ENTITY_TYPE.EMAIL_AUDIENCE)
regionScopePlugin(EmailAudience.schema)

export default EmailAudience
