import mongoose, { Schema, Document } from "mongoose"
import { LEAD_STATUS } from "@/constants/leadStatus"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"
import {
    AD_PLATFORMS,
    SOURCE_REFERENCE_MODELS,
    type AdModelName,
    type AdPlatform,
} from "@/constants/adTracking"

export interface ILead extends Document {
    name: string
    email?: string
    phone: string
    source: string

    // Which sales region owns this lead. Optional until every row is
    // backfilled. See docs/region-rollout.md.
    region?: RegionCode

    status: number

    assignedTo?: mongoose.Types.ObjectId
    convertedClientId?: mongoose.Types.ObjectId

    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId

    // Ad tracking. All optional: a lead typed in by hand has none of them.
    // See docs/ad-tracking.md.
    platform?: AdPlatform
    sourceReference?: mongoose.Types.ObjectId
    sourceReferenceModel?: AdModelName
    leadForm?: mongoose.Types.ObjectId
    externalLeadId?: string
    submittedAt?: Date
    importId?: mongoose.Types.ObjectId

    deletedAt: Date | null
    deletedBy?: mongoose.Types.ObjectId
}

const LeadSchema = new Schema<ILead>(
    {
        name: { type: String, required: true },
        email: String,
        phone: { type: String, required: true, unique: true },
        source: { type: String, required: true },

        // Not required yet. Existing rows get "IN" from
        // `npm run db:backfill-lead-region`. Make it required only after
        // that script reports 0 rows left.
        region: {
            type: String,
            enum: REGION_CODES,
            index: true
        },

        status: {
            type: Number,
            default: LEAD_STATUS.NEW,
            required: true
        },

        assignedTo: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },

        convertedClientId: {
            type: Schema.Types.ObjectId,
            ref: "Client"
        },
        lastInteractionAt: Date,
        lastInteractionId: {
            type: Schema.Types.ObjectId,
            ref: "Interaction"
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },

        // ---- Ad tracking. See docs/ad-tracking.md. ----

        // The ad platform the lead came through.
        platform: {
            type: String,
            enum: AD_PLATFORMS
        },

        // The most specific ad record known for this lead: the Ad, else
        // the Ad set, else the Campaign. Only an organic lead, with no ad
        // at all, points at the LeadForm. From an Ad, populate walks up:
        // Ad -> AdSet -> AdCampaign.
        sourceReference: {
            type: Schema.Types.ObjectId,
            refPath: "sourceReferenceModel"
        },
        sourceReferenceModel: {
            type: String,
            enum: SOURCE_REFERENCE_MODELS
        },

        // The form the person filled in. Kept apart from sourceReference
        // because one form is used by many ads. If the lead pointed at the
        // form only, there would be no way back to the ad it came from.
        leadForm: {
            type: Schema.Types.ObjectId,
            ref: "LeadForm"
        },

        // The platform's own id for this lead (Meta: leadgen id). The
        // Facebook webhook and the sheet import both set it, so the same
        // Meta lead is never saved twice.
        externalLeadId: {
            type: String,
            trim: true
        },

        // When the person sent the form, from the platform. createdAt is
        // when the lead entered the CRM.
        submittedAt: Date,

        // The sheet import that created this lead.
        importId: {
            type: Schema.Types.ObjectId,
            ref: "LeadImport"
        },

        deletedAt: {
            type: Date,
            default: null
        },

        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }

    },
    { timestamps: true }
)

// Lead counts per ad, ad set, campaign and form on the Ad Tracking pages.
LeadSchema.index({ sourceReference: 1 })
LeadSchema.index({ leadForm: 1 })
LeadSchema.index({ importId: 1 })
// One CRM lead per platform lead. Partial, so the many leads without an
// external id do not collide on null.
LeadSchema.index(
    { externalLeadId: 1 },
    { unique: true, partialFilterExpression: { externalLeadId: { $type: "string" } } }
)

softDeletePlugin(LeadSchema)

ensureAuditPlugin(LeadSchema, ENTITY_TYPE.LEAD)
statsInvalidatePlugin(LeadSchema)

regionScopePlugin(LeadSchema)

const Lead =
    mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema)

softDeletePlugin(Lead.schema)
ensureAuditPlugin(Lead.schema, ENTITY_TYPE.LEAD)
statsInvalidatePlugin(Lead.schema)

regionScopePlugin(Lead.schema)

export default Lead