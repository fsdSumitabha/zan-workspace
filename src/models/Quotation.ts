import mongoose, { Schema, Document } from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin, inheritFromEntity } from "@/lib/region-scope"

export interface IQuotation extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    entityType: number
    entityId: mongoose.Types.ObjectId
    title?: string
    amount: number
    gst_percentage: number
    url?: string
    status?: number
    uploadedBy?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId
}

const QuotationSchema = new Schema<IQuotation>(
    {
        // Not required yet. Existing rows are backfilled by
        // `npm run db:backfill-region`. Stamped on create by regionScopePlugin.
        region: {
            type: String,
            enum: REGION_CODES,
            index: true
        },
        entityType: {
            type: Number,
            enum: [0, 1, 2], // 0: LEAD, 1: CLIENT, 2: PROJECT
            required: true
        },
        entityId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        title: String,
        amount: {
            type: Number,
            required: true
            // amount will be excluding gst
        },
        gst_percentage: {
            type: Number,
            default: 18,
            required: true
        },
        url: String,
        status: Number,
        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: false
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
)

ensureAuditPlugin(QuotationSchema, ENTITY_TYPE.QUOTATION)

regionScopePlugin(QuotationSchema, { inheritFrom: inheritFromEntity })

const Quotation =
    mongoose.models.Quotation ||
    mongoose.model<IQuotation>("Quotation", QuotationSchema)

ensureAuditPlugin(Quotation.schema, ENTITY_TYPE.QUOTATION)

regionScopePlugin(Quotation.schema, { inheritFrom: inheritFromEntity })

export default Quotation