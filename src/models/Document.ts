import mongoose, { Schema, Document } from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export interface IDocument extends Document {
    clientId?: mongoose.Types.ObjectId
    projectId?: mongoose.Types.ObjectId
    title?: string
    type?: "PROPOSAL" | "CONTRACT" | "REQUIREMENT" | "INVOICE" | "OTHER"
    url?: string
    uploadedBy?: mongoose.Types.ObjectId
}

const DocumentSchema = new mongoose.Schema<IDocument>({

    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client"
    },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project"
    },

    title: String,

    type: {
        type: String,
        enum: [
            "PROPOSAL",
            "CONTRACT",
            "REQUIREMENT",
            "INVOICE",
            "OTHER"
        ]
    },

    url: String,

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

ensureAuditPlugin(DocumentSchema, ENTITY_TYPE.DOCUMENT)

const DocumentModel =
    mongoose.models.Document ||
    mongoose.model<IDocument>("Document", DocumentSchema)

ensureAuditPlugin(DocumentModel.schema, ENTITY_TYPE.DOCUMENT)

export default DocumentModel