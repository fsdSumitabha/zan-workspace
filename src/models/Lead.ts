import mongoose, { Schema, Document } from "mongoose"
import { LEAD_STATUS } from "@/constants/leadStatus"

export interface ILead extends Document {
    name: string
    email?: string
    phone: string
    source: string

    status: number

    assignedTo?: mongoose.Types.ObjectId
    convertedClientId?: mongoose.Types.ObjectId
    
    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
}

const LeadSchema = new Schema<ILead>(
    {
        name: { type: String, required: true },
        email: String,
        phone: { type: String, required: true, unique: true },
        source: { type: String, required: true },

        status: {
            type: Number,
            default: LEAD_STATUS.NEW,
            required: true
        },

        assignedTo: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },

        convertedClientId: {
            type: Schema.Types.ObjectId,
            ref: "Client"
        },
        lastInteractionAt: Date,
        lastInteractionId: {
            type: Schema.Types.ObjectId,
            ref: "Interaction"
        }
    },
    { timestamps: true }
)

export default mongoose.models.Lead ||
    mongoose.model<ILead>("Lead", LeadSchema)