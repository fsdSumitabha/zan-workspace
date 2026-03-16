import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({

    name: String,

    company: String,

    phone: String,

    email: String,

    source: {
        type: String,
        enum: ["FACEBOOK", "GOOGLE", "REFERRAL", "MANUAL"]
    },

    status: {
        type: String,
        enum: [
            "NEW_LEAD",
            "CONTACTED",
            "MEETING_SCHEDULED",
            "DISCUSSION",
            "NEGOTIATION",
            "CONVERTED",
            "LOST"
        ],
        default: "NEW_LEAD"
    },

    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    convertedClientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client"
    }

}, { timestamps: true })

export default mongoose.model("Lead", LeadSchema)