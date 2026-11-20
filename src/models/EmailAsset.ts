import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { ASSET_CATEGORY, ASSET_CATEGORIES } from "@/constants/emailStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * One image in the email asset library.
 *
 * The file itself goes to ImageKit, exactly like avatars and quotations do
 * today. Nothing is written to the function filesystem: on Vercel that
 * disk is thrown away after every deploy, which is already a known problem
 * with call recordings (see OVERVIEW.md, known issues).
 *
 * This row is the index: where the file is, how big it is, and what it is
 * called, so the editor can search and reuse it.
 */
export interface IEmailAsset extends Document {
    region: RegionCode

    name: string
    /** The ImageKit URL used in the email. */
    url: string
    /** ImageKit's own id, needed to delete the file. */
    imagekitFileId?: string
    thumbnailUrl?: string

    width?: number
    height?: number
    sizeBytes: number
    mimeType: string

    /** Default alt text, offered when the image is placed. */
    altTextDefault?: string

    category: number
    tags: string[]

    uploadedBy?: Types.ObjectId
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const EmailAssetSchema = new Schema<IEmailAsset>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        name: { type: String, required: true, trim: true, maxlength: 200 },
        url: { type: String, required: true },
        imagekitFileId: String,
        thumbnailUrl: String,

        width: Number,
        height: Number,
        sizeBytes: { type: Number, default: 0 },
        mimeType: { type: String, required: true },

        altTextDefault: { type: String, maxlength: 300 },

        category: {
            type: Number,
            enum: ASSET_CATEGORIES,
            default: ASSET_CATEGORY.GENERAL,
            required: true,
        },
        tags: { type: [String], default: [] },

        uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

EmailAssetSchema.index({ region: 1, category: 1, createdAt: -1 })
EmailAssetSchema.index({ region: 1, tags: 1 })
EmailAssetSchema.index({ region: 1, name: 1 })

softDeletePlugin(EmailAssetSchema)
ensureAuditPlugin(EmailAssetSchema, ENTITY_TYPE.EMAIL_ASSET)
regionScopePlugin(EmailAssetSchema)

const EmailAsset =
    (mongoose.models.EmailAsset as mongoose.Model<IEmailAsset>) ||
    mongoose.model<IEmailAsset>("EmailAsset", EmailAssetSchema)

softDeletePlugin(EmailAsset.schema)
ensureAuditPlugin(EmailAsset.schema, ENTITY_TYPE.EMAIL_ASSET)
regionScopePlugin(EmailAsset.schema)

export default EmailAsset
