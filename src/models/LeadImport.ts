import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import {
    AD_PLATFORMS,
    LEAD_IMPORT_STATUS,
    type AdPlatform,
    type AdSourceCounts,
    type LeadImportCounts,
} from "@/constants/adTracking"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One imported sheet of leads, and its report.
 *
 * Built like LeadSourceUpload. `rows` is a copy of every data row as it was
 * in the file, with its result. It is a copy on purpose: the leads it made
 * can be edited or deleted later, and the report must still say what the
 * file held.
 *
 * `breakdown` answers "how many leads of this import came from which
 * campaign, ad set, ad and form". It is counted once, at import time.
 */

export interface ILeadImportColumn {
    /** Column key from leadImportSheet.ts, or the cleaned header of a question column. */
    key: string
    /** The header cell exactly as it was in the file. */
    header: string
    label: string
    /** false for a column that is not in leadImportSheet.ts. Those are read as form questions. */
    known: boolean
}

export interface ILeadImportRow {
    /** Row number as Excel shows it. */
    n: number
    /** One value per entry in `columns`, as text. */
    values: string[]
    /** LEAD_IMPORT_ROW_RESULT code. */
    result: number
    messages: string[]
    /** The lead this row created, or the lead it duplicated. */
    leadId?: Types.ObjectId
}

export interface ILeadImportBreakdownRow {
    ref: Types.ObjectId
    externalId: string
    name: string
    imported: number
    duplicates: number
    failed: number
}

export interface ILeadImport extends Document {
    region: RegionCode
    platform: AdPlatform
    /** The Lead.source text for rows whose sheet does not say. */
    source: string

    fileName: string
    fileSize: number
    sheetName?: string
    headerRow?: number

    uploadedBy: Types.ObjectId

    columns: ILeadImportColumn[]
    fileNotes: string[]
    rows: ILeadImportRow[]

    counts: LeadImportCounts
    /** Ad records this import created. Records that already existed are not counted. */
    newSources: AdSourceCounts
    breakdown: {
        campaigns: ILeadImportBreakdownRow[]
        adSets: ILeadImportBreakdownRow[]
        ads: ILeadImportBreakdownRow[]
        forms: ILeadImportBreakdownRow[]
    }

    status: number
    error?: string

    createdAt: Date
    updatedAt: Date
}

const ColumnSchema = new Schema<ILeadImportColumn>(
    {
        key: { type: String, required: true },
        header: String,
        label: String,
        known: Boolean,
    },
    { _id: false }
)

const RowSchema = new Schema<ILeadImportRow>(
    {
        n: { type: Number, required: true },
        values: [String],
        result: { type: Number, required: true },
        messages: [String],
        leadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    },
    { _id: false }
)

const BreakdownRowSchema = new Schema<ILeadImportBreakdownRow>(
    {
        ref: { type: Schema.Types.ObjectId, required: true },
        externalId: String,
        name: String,
        imported: { type: Number, default: 0 },
        duplicates: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
    },
    { _id: false }
)

const countField = { type: Number, default: 0 }

const LeadImportSchema = new Schema<ILeadImport>(
    {
        region: { type: String, enum: REGION_CODES, required: true, index: true },
        platform: { type: String, enum: AD_PLATFORMS, required: true },
        source: { type: String, required: true },

        fileName: { type: String, required: true },
        fileSize: Number,
        sheetName: String,
        headerRow: Number,

        uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

        columns: { type: [ColumnSchema], default: [] },
        fileNotes: { type: [String], default: [] },
        rows: { type: [RowSchema], default: [] },

        counts: {
            read: countField,
            imported: countField,
            warned: countField,
            duplicates: countField,
            failed: countField,
            linked: countField,
        },
        newSources: {
            campaigns: countField,
            adSets: countField,
            ads: countField,
            forms: countField,
        },
        breakdown: {
            campaigns: { type: [BreakdownRowSchema], default: [] },
            adSets: { type: [BreakdownRowSchema], default: [] },
            ads: { type: [BreakdownRowSchema], default: [] },
            forms: { type: [BreakdownRowSchema], default: [] },
        },

        status: {
            type: Number,
            enum: Object.values(LEAD_IMPORT_STATUS),
            default: LEAD_IMPORT_STATUS.PROCESSING,
        },
        error: String,
    },
    { timestamps: true }
)

LeadImportSchema.index({ region: 1, createdAt: -1 })

ensureAuditPlugin(LeadImportSchema, ENTITY_TYPE.LEAD_IMPORT)
regionScopePlugin(LeadImportSchema)

const LeadImport =
    (mongoose.models.LeadImport as mongoose.Model<ILeadImport>) ||
    mongoose.model<ILeadImport>("LeadImport", LeadImportSchema)

ensureAuditPlugin(LeadImport.schema, ENTITY_TYPE.LEAD_IMPORT)
regionScopePlugin(LeadImport.schema)

export default LeadImport
