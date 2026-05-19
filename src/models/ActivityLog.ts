import mongoose, { Schema, Document } from "mongoose"

export interface IActivityLog extends Document {
    entityType?: | "USER" | "LEAD" | "CLIENT" | "PROJECT" | "INTERACTION" | "CALL" | "MEETING" | "DOCUMENT" | "QUOTATION"
    entityId?: mongoose.Types.ObjectId
    action?: string
    oldData?: Record<string, unknown>
    newData?: Record<string, unknown>
    userId?: mongoose.Types.ObjectId
}

const ActivityLogSchema = new mongoose.Schema<IActivityLog>({

    entityType: {
        type: String,
        enum: [
            "USER",
            "LEAD",
            "CLIENT",
            "PROJECT",
            "INTERACTION",
            "CALL",
            "MEETING",
            "DOCUMENT",
            "QUOTATION",
        ]
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