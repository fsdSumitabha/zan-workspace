import mongoose, { Schema, Document } from "mongoose";

export interface IInteraction extends Document {
    entityType: number
    entityId: mongoose.Types.ObjectId
    type: number
    title?: string
    description?: string
    refId?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId
}

const InteractionSchema = new mongoose.Schema<IInteraction>({

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
        type: Number,
        required: true
    },

    title: String,

    description: String,

    refId: mongoose.Schema.Types.ObjectId, // points to Meeting / Document

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

export default mongoose.models.Interaction || mongoose.model<IInteraction>("Interaction", InteractionSchema) 