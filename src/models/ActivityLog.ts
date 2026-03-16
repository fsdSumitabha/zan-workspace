import mongoose from "mongoose";

const ActivityLogSchema = new mongoose.Schema({

    entityType: {
        type: String,
        enum: [
            "LEAD",
            "CLIENT",
            "PROJECT",
            "MEETING",
            "DOCUMENT"
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

}, { timestamps: true })

export default mongoose.model("ActivityLog", ActivityLogSchema)