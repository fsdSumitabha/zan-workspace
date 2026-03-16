import mongoose from "mongoose";

const InteractionSchema = new mongoose.Schema({

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project"
    },

    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client"
    },

    type: {
        type: String,
        enum: [
            "MEETING",
            "NOTE",
            "PROPOSAL",
            "DOCUMENT",
            "CALL"
        ]
    },

    title: String,

    description: String,

    meetingLink: String,

    meetingDate: Date,

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

export default mongoose.model("Interaction", InteractionSchema)