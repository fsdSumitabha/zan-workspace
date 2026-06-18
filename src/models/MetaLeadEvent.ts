import mongoose, { Schema, Document, Query, model, models } from "mongoose";
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export interface IMetaLeadEvent extends Document {
    leadgenId: string
    formId: string
    pageId: string
    adId?: string | null
    adgroupId?: string | null
    createdTime?: Date
    status: string
    rawPayload?: Record<string, unknown>
    error?: string | null
    leadId?: mongoose.Types.ObjectId | null
    deletedAt: Date | null
}

const MetaLeadEventSchema = new Schema<IMetaLeadEvent>(
    {
        leadgenId: { type: String, required: true, unique: true, index: true },
        formId: { type: String, required: true },
        pageId: { type: String, required: true },
        adId: { type: String, default: null },
        adgroupId: { type: String, default: null },
        createdTime: { type: Date },

        status: {
            type: String,
            enum: ["received", "processing", "enriched", "failed"],
            default: "received",
            index: true,
        },
        rawPayload: { type: Schema.Types.Mixed },   // full change.value for debugging
        error: { type: String, default: null },
        leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null }, // link to enriched Lead
        deletedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

MetaLeadEventSchema.pre(/^find/, function (this: Query<any, IMetaLeadEvent>) {
    this.where({ deletedAt: null })
})

ensureAuditPlugin(MetaLeadEventSchema, ENTITY_TYPE.META_LEAD_EVENT)
statsInvalidatePlugin(MetaLeadEventSchema)

const MetaLeadEvent =
    models.MetaLeadEvent || model<IMetaLeadEvent>("MetaLeadEvent", MetaLeadEventSchema)

ensureAuditPlugin(MetaLeadEvent.schema, ENTITY_TYPE.META_LEAD_EVENT)
statsInvalidatePlugin(MetaLeadEvent.schema)

export default MetaLeadEvent;