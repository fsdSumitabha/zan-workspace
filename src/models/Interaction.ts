import mongoose, { Document } from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin, inheritFromEntity } from "@/lib/region-scope"

export interface IInteractionEdit {
    oldTitle?: string
    oldDescription?: string
    editedBy: mongoose.Types.ObjectId
    editedAt: Date
}

export interface IInteraction extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    entityType: number
    entityId: mongoose.Types.ObjectId
    type: number
    title?: string
    description?: string
    refId?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId
    editHistory?: IInteractionEdit[]
}

const InteractionSchema = new mongoose.Schema<IInteraction>({
    // Not required yet. Existing rows are backfilled by
    // `npm run db:backfill-region`. Stamped on create by regionScopePlugin.
    region: {
        type: String,
        enum: REGION_CODES,
        index: true
    },

    entityType: {
        type: Number,
        enum: [0, 1, 2], // 0: LEAD, 1: CLIENT, 2: PROJECT
        required: true
    },

    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    type: {
        type: Number,
        required: true
    },

    title: String,

    description: String,

    refId: mongoose.Schema.Types.ObjectId, // points to Meeting / Document

    editHistory: [{
        oldTitle: { type: String },
        oldDescription: { type: String },
        editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        editedAt: { type: Date, default: Date.now }
    }],

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

ensureAuditPlugin(InteractionSchema, ENTITY_TYPE.INTERACTION)

regionScopePlugin(InteractionSchema, { inheritFrom: inheritFromEntity })

const Interaction =
    mongoose.models.Interaction ||
    mongoose.model<IInteraction>("Interaction", InteractionSchema)

ensureAuditPlugin(Interaction.schema, ENTITY_TYPE.INTERACTION)

regionScopePlugin(Interaction.schema, { inheritFrom: inheritFromEntity })

export default Interaction