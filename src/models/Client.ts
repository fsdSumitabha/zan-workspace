import mongoose, { Schema, Document } from "mongoose"
import { CLIENT_STATUS } from "@/constants/clientStatus"

export interface IClient extends Document {
    name: string
    company: string
    email?: string
    phone: string

    status: number

    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
}

const ClientSchema = new Schema<IClient>(
    {
        name: { type: String, required: true },
        company: { type: String, required: true },
        email: String,
        phone: { type: String, required: true },

        status: {
            type: Number,
            default: CLIENT_STATUS.ACTIVE,
            required: true
        },
        lastInteractionAt: Date,
        lastInteractionId: {
            type: Schema.Types.ObjectId,
            ref: "Interaction"
        }

    },
    { timestamps: true }
)

export default mongoose.models.Client ||
    mongoose.model<IClient>("Client", ClientSchema)