import mongoose, { Schema, Document } from "mongoose"
import { PROJECT_STATUS } from "@/constants/projectStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"

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
    createdBy?: mongoose.Types.ObjectId
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
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
    },
    { timestamps: true }
)

ensureAuditPlugin(ProjectSchema, "PROJECT")

const Project =
    mongoose.models.Project ||
    mongoose.model<IProject>("Project", ProjectSchema)

ensureAuditPlugin(Project.schema, "PROJECT")

export default Project