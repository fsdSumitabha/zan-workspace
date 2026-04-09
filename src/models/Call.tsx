import mongoose from "mongoose"

const CallSchema = new mongoose.Schema({

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

export default mongoose.models.Call || mongoose.model("Call", CallSchema)