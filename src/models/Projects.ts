import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema({

    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company"
    },

    title: String,

    description: String,

    service: {
        type: String,
        enum: [
            "WEB_DEVELOPMENT",
            "DIGITAL_MARKETING",
            "SEO",
            "MOBILE_APP",
            "BLOCKCHAIN"
        ]
    },

    status: {
        type: String,
        enum: [
            "DISCUSSION",
            "PROPOSAL_SENT",
            "NEGOTIATION",
            "CONFIRMED",
            "IN_PROGRESS",
            "DEPLOYED",
            "MAINTENANCE",
            "CLOSED"
        ],
        default: "DISCUSSION"
    },

    estimatedBudget: Number,

    securedBudget: Number,

    paidAmount: Number,

    dueAmount: Number,

    nextPaymentDate: Date,

}, { timestamps: true })

export default mongoose.model("Project", ProjectSchema)