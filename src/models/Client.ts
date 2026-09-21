import mongoose, { Schema, Document, Query } from "mongoose"
import { CLIENT_STATUS } from "@/constants/clientStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin } from "@/lib/region-scope"
import type { Types } from "mongoose"

export interface IClient extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    name: string
    company: string
    email?: string
    phone: string

    status: number

    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
    leadId?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId
    deletedAt: Date | null
    deletedBy?: mongoose.Types.ObjectId
}

const ClientSchema = new Schema<IClient>(
    {
        // Not required yet. Existing rows are backfilled by
        // `npm run db:backfill-region`. Stamped on create by regionScopePlugin.
        region: {
            type: String,
            enum: REGION_CODES,
            index: true
        },
        name: { type: String, required: true },
        company: { type: String, required: true },
        email: String,
        phone: { type: String, required: true },

        status: {
            type: Number,
            default: CLIENT_STATUS.ACTIVE,
            required: true
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
        leadId: {
            type: Schema.Types.ObjectId,
            ref: "Lead"
        },

        deletedAt: { type: Date, default: null },

        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
)

ClientSchema.pre(/^find/, function (this: Query<any, IClient>) {
    this.where({ deletedAt: null })
})

ensureAuditPlugin(ClientSchema, ENTITY_TYPE.CLIENT)
statsInvalidatePlugin(ClientSchema)

regionScopePlugin(ClientSchema, {
    inheritFrom: (doc) =>
        doc.leadId ? { model: "Lead", id: doc.leadId as Types.ObjectId } : null,
})

const Client =
    mongoose.models.Client ||
    mongoose.model<IClient>("Client", ClientSchema)

ensureAuditPlugin(Client.schema, ENTITY_TYPE.CLIENT)
statsInvalidatePlugin(Client.schema)

regionScopePlugin(Client.schema, {
    inheritFrom: (doc) =>
        doc.leadId ? { model: "Lead", id: doc.leadId as Types.ObjectId } : null,
})

export default Client