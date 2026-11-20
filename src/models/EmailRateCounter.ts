import mongoose, { Schema, Document } from "mongoose"

/**
 * One bucket of the global send rate limiter.
 *
 * ## Why this exists at all
 *
 * Nodemailer's own `rateLimit` applies to one transporter in one process.
 * Ten workers each set to 10 per second send 100 per second, not 10. The
 * provider sees the total, so the limit has to be shared. This collection
 * is where it is shared.
 *
 * `_id` is "providerKey:bucket", where bucket is a unix second or a day
 * key. A worker claims permits in bulk with one findOneAndUpdate, so a
 * batch of 100 costs one round trip, not 100.
 *
 * ## Deliberately not region scoped, and not audited
 *
 * This is plumbing, not domain data. The rate limit belongs to the SMTP
 * provider, which is shared across regions, so adding regionScopePlugin
 * would split one budget into three and silently break the limit.
 *
 * ## It cleans itself up
 *
 * A TTL index on `expiresAt`. There is no sweeper to write and no cron to
 * forget.
 */
// Document<string>: the _id here is our own key string, not an ObjectId.
export interface IEmailRateCounter extends Document<string> {
    /** "gmail:1763548800" or "gmail:day:2026-11-19". */
    _id: string
    used: number
    expiresAt: Date
}

const EmailRateCounterSchema = new Schema<IEmailRateCounter>(
    {
        _id: { type: String, required: true },
        used: { type: Number, default: 0 },
        expiresAt: { type: Date, required: true },
    },
    { versionKey: false, _id: false }
)

EmailRateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const EmailRateCounter =
    (mongoose.models.EmailRateCounter as mongoose.Model<IEmailRateCounter>) ||
    mongoose.model<IEmailRateCounter>("EmailRateCounter", EmailRateCounterSchema)

export default EmailRateCounter
