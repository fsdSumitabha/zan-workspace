import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({

    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client"
    },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project"
    },

    title: String,

    type: {
        type: String,
        enum: [
            "PROPOSAL",
            "CONTRACT",
            "REQUIREMENT",
            "INVOICE",
            "OTHER"
        ]
    },

    url: String,

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

export default mongoose.model("Document", DocumentSchema)