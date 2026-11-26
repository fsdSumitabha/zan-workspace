import mongoose, { Schema, Document } from "mongoose"

/**
 * One row per request a website sent to /api/integrations/*.
 *
 * A website retries a call once when the first attempt times out or fails
 * on the way, with the same id. This row is how the second attempt knows
 * the first one already saved the lead, so a retry never adds a second
 * lead or a second note. See src/lib/integrations/receipt.ts.
 *
 * Not region scoped and not audited: it holds no contact details, only
 * which request was seen and what was answered. Rows expire after 30 days,
 * long after any retry.
 */
export interface IIntegrationReceipt extends Document {
    /** The website's id, from INTEGRATION_SITES. */
    site: string
    /** The body's id, which is also the Idempotency-Key header. */
    requestId: string
    kind: "lead" | "newsletter"
    /** "processing" while the first attempt runs, "done" once it answered. */
    state: "processing" | "done"
    /** What the first attempt answered, for a repeat of the same request. */
    status?: string
    /** When the attempt that is working on it started. */
    claimedAt: Date
    createdAt: Date
    updatedAt: Date
}

const IntegrationReceiptSchema = new Schema<IIntegrationReceipt>(
    {
        site: { type: String, required: true },
        requestId: { type: String, required: true },
        kind: { type: String, enum: ["lead", "newsletter"], required: true },
        state: { type: String, enum: ["processing", "done"], required: true },
        status: String,
        claimedAt: { type: Date, required: true },
    },
    { timestamps: true }
)

IntegrationReceiptSchema.index({ site: 1, requestId: 1 }, { unique: true })
IntegrationReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })

const IntegrationReceipt =
    (mongoose.models.IntegrationReceipt as mongoose.Model<IIntegrationReceipt>) ||
    mongoose.model<IIntegrationReceipt>("IntegrationReceipt", IntegrationReceiptSchema)

export default IntegrationReceipt
