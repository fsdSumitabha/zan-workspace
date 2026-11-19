import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { TEMPLATE_CATEGORY, TEMPLATE_CATEGORIES } from "@/constants/emailStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * A named email template. The content lives in EmailTemplateVersion.
 *
 * This row is the stable handle: a name, a category, and a pointer at the
 * current version. Editing a template creates a new version; it never
 * changes an old one, because a sent campaign points at the version it
 * used.
 *
 * `draftMjml` is the autosave buffer. It is written every twenty seconds
 * while somebody is in the editor and is NOT a version. Only an explicit
 * save creates a version, and only after the server recompiles the MJML
 * successfully.
 */
export interface IEmailTemplate extends Document {
    region: RegionCode

    name: string
    description?: string
    category: number
    tags: string[]

    currentVersionId?: Types.ObjectId
    /** Autosave buffer. Not a version. */
    draftMjml?: string
    draftSavedAt?: Date
    draftSavedBy?: Types.ObjectId

    /** An ImageKit URL of a rendered preview, when one has been made. */
    thumbnailUrl?: string

    createdBy?: Types.ObjectId
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        name: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, maxlength: 1000 },
        category: {
            type: Number,
            enum: TEMPLATE_CATEGORIES,
            default: TEMPLATE_CATEGORY.GENERAL,
            required: true,
        },
        tags: { type: [String], default: [] },

        currentVersionId: {
            type: Schema.Types.ObjectId,
            ref: "EmailTemplateVersion",
        },
        draftMjml: String,
        draftSavedAt: Date,
        draftSavedBy: { type: Schema.Types.ObjectId, ref: "User" },

        thumbnailUrl: String,

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

EmailTemplateSchema.index({ region: 1, name: 1 })
EmailTemplateSchema.index({ region: 1, category: 1, updatedAt: -1 })
EmailTemplateSchema.index({ region: 1, tags: 1 })

softDeletePlugin(EmailTemplateSchema)
ensureAuditPlugin(EmailTemplateSchema, ENTITY_TYPE.EMAIL_TEMPLATE)
regionScopePlugin(EmailTemplateSchema)

const EmailTemplate =
    (mongoose.models.EmailTemplate as mongoose.Model<IEmailTemplate>) ||
    mongoose.model<IEmailTemplate>("EmailTemplate", EmailTemplateSchema)

softDeletePlugin(EmailTemplate.schema)
ensureAuditPlugin(EmailTemplate.schema, ENTITY_TYPE.EMAIL_TEMPLATE)
regionScopePlugin(EmailTemplate.schema)

export default EmailTemplate
