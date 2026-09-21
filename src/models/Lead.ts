import mongoose, { Schema, Document, Query } from "mongoose"
import { LEAD_STATUS } from "@/constants/leadStatus"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { regionScopePlugin } from "@/lib/region-scope"

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

LeadSchema.pre(/^find/, function (this: Query<any, ILead>) {
    this.where({ deletedAt: null })
})

ensureAuditPlugin(LeadSchema, ENTITY_TYPE.LEAD)
statsInvalidatePlugin(LeadSchema)

regionScopePlugin(LeadSchema)

const Lead =
    mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema)

ensureAuditPlugin(Lead.schema, ENTITY_TYPE.LEAD)
statsInvalidatePlugin(Lead.schema)

regionScopePlugin(Lead.schema)

export default Lead