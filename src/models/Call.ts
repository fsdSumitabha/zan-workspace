import mongoose from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin, inheritFromEntity } from "@/lib/region-scope"

export interface ICall extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    entityType: number
    entityId: mongoose.Types.ObjectId
    contactPersonName: string
    contactPersonPhone?: string
    callTime: Date
    duration: number
    recordingUrl?: string
    notes?: string
    direction: number
    status: number
    createdBy?: mongoose.Types.ObjectId
}

const CallSchema = new mongoose.Schema<ICall>({
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

    // Who was on the call (external person)
    contactPersonName: {
        type: String,
        required: true
    },

    contactPersonPhone: {
        type: String
    },

    // Call timing
    callTime: {
        type: Date,
        required: true
    },

    duration: {
        type: Number, // in seconds or minutes (decide globally)
        required: true
    },

    // Recording (optional)
    recordingUrl: {
        type: String
    },

    // Notes / summary of call
    notes: {
        type: String
    },

    // Call direction
    direction: {
        type: Number,
        enum: [0, 1], // 0: OUTGOING, 1: INCOMING
        required: true
    },

    // Call status
    status: {
        type: Number,
        required: true
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

ensureAuditPlugin(CallSchema, ENTITY_TYPE.CALL)

regionScopePlugin(CallSchema, { inheritFrom: inheritFromEntity })

const Call =
    mongoose.models.Call || mongoose.model<ICall>("Call", CallSchema)

ensureAuditPlugin(Call.schema, ENTITY_TYPE.CALL)

regionScopePlugin(Call.schema, { inheritFrom: inheritFromEntity })

export default Call