import mongoose, { Schema, Document } from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"

export interface IQuotation extends Document {
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

ensureAuditPlugin(QuotationSchema, "QUOTATION")

const Quotation =
    mongoose.models.Quotation ||
    mongoose.model<IQuotation>("Quotation", QuotationSchema)

ensureAuditPlugin(Quotation.schema, "QUOTATION")

export default Quotation