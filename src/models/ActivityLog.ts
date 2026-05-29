import mongoose, { Schema, Document } from "mongoose"
import { ENTITY_TYPE, EntityType } from "@/constants/entityTypes"

export interface IActivityLog extends Document {
    entityType?: EntityType
    entityId?: mongoose.Types.ObjectId
    action?: string
    oldData?: Record<string, unknown>
    newData?: Record<string, unknown>
    userId?: mongoose.Types.ObjectId
}

const ActivityLogSchema = new mongoose.Schema<IActivityLog>({

    entityType: {
        type: Number,
        enum: Object.values(ENTITY_TYPE),
        required: true,
    },

    entityId: mongoose.Schema.Types.ObjectId,

    action: String,

    oldData: Object,

    newData: Object,

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true, collection: "activity_logs" })

ActivityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
ActivityLogSchema.index({ userId: 1, createdAt: -1 })

export default mongoose.models.ActivityLog || mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema)