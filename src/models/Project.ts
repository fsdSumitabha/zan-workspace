import mongoose, { Schema, Document } from "mongoose"
import { PROJECT_STATUS } from "@/constants/projectStatus"

export interface IProject extends Document {
    clientId: mongoose.Types.ObjectId
    companyName?: string
    title: string
    description?: string
    serviceType?: string

    status: number

    budget?: number

    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
}

const ProjectSchema = new Schema<IProject>(
    {
        clientId: {
            type: Schema.Types.ObjectId,
            ref: "Client",
            required: true
        },
        companyName: String,
        title: { type: String, required: true },
        description: String,
        serviceType: String,

        status: {
            type: Number,
            default: PROJECT_STATUS.DISCUSSION,
            required: true
        },

        budget: Number,

        lastInteractionAt: Date,
        lastInteractionId: {
            type: Schema.Types.ObjectId,
            ref: "Interaction"
        }
    },
    { timestamps: true }
)

export default mongoose.models.Project ||
    mongoose.model<IProject>("Project", ProjectSchema)