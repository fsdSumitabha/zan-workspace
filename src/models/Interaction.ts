import mongoose from "mongoose";

const InteractionSchema = new mongoose.Schema({

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
        type: String,
        enum: [
            "MEETING_SCHEDULED",
            "MEETING_COMPLETED",
            "MEETING_CANCELLED",
            "NOTE",
            "CALL",
            "DOCUMENT",
            "PROPOSAL"
        ]
    },

    title: String,

    description: String,

    refId: mongoose.Schema.Types.ObjectId, // points to Meeting / Document

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

export default mongoose.models.Interaction || mongoose.model("Interaction", InteractionSchema) 