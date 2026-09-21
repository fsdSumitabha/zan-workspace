import mongoose, { Schema, Document } from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin } from "@/lib/region-scope"
import type { Types } from "mongoose"

export interface IDocument extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    clientId?: mongoose.Types.ObjectId
    projectId?: mongoose.Types.ObjectId
    title?: string
    type?: "PROPOSAL" | "CONTRACT" | "REQUIREMENT" | "INVOICE" | "OTHER"
    url?: string
    uploadedBy?: mongoose.Types.ObjectId
}

const DocumentSchema = new mongoose.Schema<IDocument>({
    // Not required yet. Existing rows are backfilled by
    // `npm run db:backfill-region`. Stamped on create by regionScopePlugin.
    region: {
        type: String,
        enum: REGION_CODES,
        index: true
    },

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

regionScopePlugin(DocumentSchema, {
    inheritFrom: (doc) =>
        doc.projectId
            ? { model: "Project", id: doc.projectId as Types.ObjectId }
            : doc.clientId
              ? { model: "Client", id: doc.clientId as Types.ObjectId }
              : null,
})

const DocumentModel =
    mongoose.models.Document ||
    mongoose.model<IDocument>("Document", DocumentSchema)

ensureAuditPlugin(DocumentModel.schema, ENTITY_TYPE.DOCUMENT)

regionScopePlugin(DocumentModel.schema, {
    inheritFrom: (doc) =>
        doc.projectId
            ? { model: "Project", id: doc.projectId as Types.ObjectId }
            : doc.clientId
              ? { model: "Client", id: doc.clientId as Types.ObjectId }
              : null,
})

export default DocumentModel