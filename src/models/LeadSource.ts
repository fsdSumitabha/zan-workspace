import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { LEAD_SOURCE_STATUS, LEAD_SOURCE_STATUSES } from "@/constants/leadSourceStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * One row of an uploaded cold-calling sheet.
 *
 * Kept apart from Lead on purpose. A lead source is a number to call, not a
 * prospect yet. When a call goes well it is converted, and a real Lead is
 * created from it. See docs/lead-sources.md.
 */

export interface ILeadSourceActivity {
    _id: Types.ObjectId
    /** LEAD_SOURCE_ACTIVITY code. */
    type: number
    /** The note, or the remark typed with a change. */
    text?: string
    /** Old and new value of the change: a status code, a day or a name. */
    from?: unknown
    to?: unknown
    /** Set on callback entries. */
    callbackAt?: Date | null
    by?: Types.ObjectId
    /** Name at the time, so the timeline reads the same after a rename. */
    byName?: string
    at: Date
}

export interface ILeadSource extends Document {
    region: RegionCode

    uploadId?: Types.ObjectId
    /** Row number in the uploaded sheet, as Excel shows it. */
    rowNumber?: number

    name: string
    company?: string
    email?: string
    /** E.164, for example "+14155550123". */
    phone: string

    /** Every cell of the sheet row as text, by column key. See leadSourceSheet.ts. */
    data: Map<string, string>
    /** Warnings from the upload check, such as "Email is not valid". */
    importNotes: string[]

    status: number

    assignedTo?: Types.ObjectId | null
    /** The calendar day to call on, "YYYY-MM-DD". No time, no time zone. */
    allottedDay?: string | null
    /** When to call back. Set with the Call Back status or the clock button. */
    callbackAt?: Date | null

    lastNote?: string
    lastNoteAt?: Date
    lastActivityAt?: Date
    activity: ILeadSourceActivity[]

    convertedLeadId?: Types.ObjectId
    convertedAt?: Date

    createdBy?: Types.ObjectId
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const ActivitySchema = new Schema<ILeadSourceActivity>({
    type: { type: Number, required: true },
    text: String,
    from: Schema.Types.Mixed,
    to: Schema.Types.Mixed,
    callbackAt: Date,
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byName: String,
    at: { type: Date, default: Date.now },
})

const LeadSourceSchema = new Schema<ILeadSource>(
    {
        // Required from the start. This model is new, so there are no old
        // rows to backfill. Uploads set it through resolveWriteRegion.
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        uploadId: { type: Schema.Types.ObjectId, ref: "LeadSourceUpload" },
        rowNumber: Number,

        name: { type: String, required: true, trim: true },
        company: String,
        email: String,
        phone: { type: String, required: true },

        data: { type: Map, of: String, default: {} },
        importNotes: { type: [String], default: [] },

        status: {
            type: Number,
            enum: LEAD_SOURCE_STATUSES,
            default: LEAD_SOURCE_STATUS.NEW,
            required: true,
        },

        assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
        allottedDay: {
            type: String,
            default: null,
            match: /^\d{4}-\d{2}-\d{2}$/,
        },
        callbackAt: { type: Date, default: null },

        lastNote: String,
        lastNoteAt: Date,
        lastActivityAt: Date,
        activity: { type: [ActivitySchema], default: [] },

        convertedLeadId: { type: Schema.Types.ObjectId, ref: "Lead" },
        convertedAt: Date,

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

// The list page filters on these, in this order, for every view.
LeadSourceSchema.index({ region: 1, assignedTo: 1, allottedDay: 1, status: 1 })
// Duplicate check on upload. Not unique: a deleted source must not block
// the same number from being uploaded again.
LeadSourceSchema.index({ region: 1, phone: 1 })
LeadSourceSchema.index({ uploadId: 1, rowNumber: 1 })
LeadSourceSchema.index({ callbackAt: 1 })

softDeletePlugin(LeadSourceSchema)
ensureAuditPlugin(LeadSourceSchema, ENTITY_TYPE.LEAD_SOURCE)
regionScopePlugin(LeadSourceSchema)

const LeadSource =
    (mongoose.models.LeadSource as mongoose.Model<ILeadSource>) ||
    mongoose.model<ILeadSource>("LeadSource", LeadSourceSchema)

softDeletePlugin(LeadSource.schema)
ensureAuditPlugin(LeadSource.schema, ENTITY_TYPE.LEAD_SOURCE)
regionScopePlugin(LeadSource.schema)

export default LeadSource
