import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { UPLOAD_STATUS } from "@/constants/leadSourceStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One uploaded sheet, and its report.
 *
 * `rows` is a copy of every data row as it was in the file, with the result
 * of the check. The report page and the report download read it. It is a
 * copy on purpose: the lead sources it created can be edited, converted or
 * deleted later, and the report must still say what the file held.
 */

export interface IUploadColumn {
    /** Column key from leadSourceSheet.ts, or a cleaned header for an unknown column. */
    key: string
    /** The header cell exactly as it was in the file. */
    header: string
    label: string
    /** false for a header that matched no configured column. */
    known: boolean
}

export interface IUploadRow {
    /** Row number as Excel shows it. */
    n: number
    /** One value per entry in `columns`, as text. */
    values: string[]
    /** UPLOAD_ROW_RESULT code. */
    result: number
    messages: string[]
    sourceId?: Types.ObjectId
}

export interface ILeadSourceUpload extends Document {
    region: RegionCode

    fileName: string
    fileSize: number
    sheetName?: string
    headerRow?: number

    uploadedBy: Types.ObjectId
    assignedTo?: Types.ObjectId | null
    allottedDay?: string | null

    columns: IUploadColumn[]
    /** Configured columns the file did not have. */
    missingColumns: string[]
    /** Notes about the file as a whole, such as ignored columns. */
    fileNotes: string[]
    rows: IUploadRow[]

    counts: {
        read: number
        imported: number
        warned: number
        skipped: number
    }

    status: number
    error?: string

    createdAt: Date
    updatedAt: Date
}

const UploadColumnSchema = new Schema<IUploadColumn>(
    {
        key: { type: String, required: true },
        header: String,
        label: String,
        known: Boolean,
    },
    { _id: false }
)

const UploadRowSchema = new Schema<IUploadRow>(
    {
        n: { type: Number, required: true },
        values: [String],
        result: { type: Number, required: true },
        messages: [String],
        sourceId: { type: Schema.Types.ObjectId, ref: "LeadSource" },
    },
    { _id: false }
)

const LeadSourceUploadSchema = new Schema<ILeadSourceUpload>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        fileName: { type: String, required: true },
        fileSize: Number,
        sheetName: String,
        headerRow: Number,

        uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
        allottedDay: { type: String, default: null },

        columns: { type: [UploadColumnSchema], default: [] },
        missingColumns: { type: [String], default: [] },
        fileNotes: { type: [String], default: [] },
        rows: { type: [UploadRowSchema], default: [] },

        counts: {
            read: { type: Number, default: 0 },
            imported: { type: Number, default: 0 },
            warned: { type: Number, default: 0 },
            skipped: { type: Number, default: 0 },
        },

        status: {
            type: Number,
            enum: Object.values(UPLOAD_STATUS),
            default: UPLOAD_STATUS.PROCESSING,
        },
        error: String,
    },
    { timestamps: true }
)

LeadSourceUploadSchema.index({ region: 1, createdAt: -1 })

ensureAuditPlugin(LeadSourceUploadSchema, ENTITY_TYPE.LEAD_SOURCE_UPLOAD)
regionScopePlugin(LeadSourceUploadSchema)

const LeadSourceUpload =
    (mongoose.models.LeadSourceUpload as mongoose.Model<ILeadSourceUpload>) ||
    mongoose.model<ILeadSourceUpload>("LeadSourceUpload", LeadSourceUploadSchema)

ensureAuditPlugin(LeadSourceUpload.schema, ENTITY_TYPE.LEAD_SOURCE_UPLOAD)
regionScopePlugin(LeadSourceUpload.schema)

export default LeadSourceUpload
