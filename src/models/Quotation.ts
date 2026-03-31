import mongoose from "mongoose";

const QuotationSchema = new mongoose.Schema({

    entityType: {
        type: Number,
        enum: [0, 1, 2], // 0: LEAD, 1: CLIENT, 2: PROJECT
        required: true
    },

    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    title: String,

    amount: {
        type: Number,
        required: true
        //amount will be excluding gst
    },

    gst_percentage: {
        type: Number,
        default: 18,
        required: true
    },
    
    url: String,

    status: Number,
    
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false
    }

}, { timestamps: true })

export default mongoose.models.Quotation || mongoose.model("Quotation", QuotationSchema)
