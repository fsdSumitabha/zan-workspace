import mongoose, { Schema, Document } from "mongoose"
import { CLIENT_STATUS } from "@/constants/clientStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export interface IClient extends Document {
    name: string
    company: string
    email?: string
    phone: string

    status: number

    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
    leadId?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId

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
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        leadId: {
            type: Schema.Types.ObjectId,
            ref: "Lead"
        }

    },
    { timestamps: true }
)

ensureAuditPlugin(ClientSchema, ENTITY_TYPE.CLIENT)
statsInvalidatePlugin(ClientSchema)

const Client =
    mongoose.models.Client ||
    mongoose.model<IClient>("Client", ClientSchema)

ensureAuditPlugin(Client.schema, ENTITY_TYPE.CLIENT)
statsInvalidatePlugin(Client.schema)

export default Client