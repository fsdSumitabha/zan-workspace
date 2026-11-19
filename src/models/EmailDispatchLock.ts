import mongoose, { Schema, Document } from "mongoose"

/**
 * The dispatcher's mutex. One document, `_id` is "dispatch".
 *
 * Two heartbeats 200 ms apart would otherwise both find the same due
 * campaign and both start building its recipient snapshot. The lock is
 * claimed with a guarded findOneAndUpdate: one wins, the other returns
 * "skipped".
 *
 * ## Why a lease and not a boolean
 *
 * A boolean set by a dispatcher that then crashes would block every later
 * heartbeat for ever. A lease expires on its own, so the next tick takes
 * over without anyone noticing.
 *
 * ## Deliberately not region scoped
 *
 * The dispatcher is one process for the whole deployment. It runs inside
 * runWithoutRegionScope and handles due campaigns in every region in one
 * pass, so a per-region lock would be wrong.
 */
// Document<string>: the _id here is the literal "dispatch", not an ObjectId.
export interface IEmailDispatchLock extends Document<string> {
    _id: string
    /** The lock is free once this time has passed. */
    leaseUntil: Date | null
    /** Which invocation holds it. For debugging a stuck dispatcher. */
    owner?: string
    /** Set when the holder finishes, so the next tick need not wait. */
    releasedAt?: Date | null
    updatedAt: Date
}

const EmailDispatchLockSchema = new Schema<IEmailDispatchLock>(
    {
        _id: { type: String, required: true },
        leaseUntil: { type: Date, default: null },
        owner: String,
        releasedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, _id: false }
)

const EmailDispatchLock =
    (mongoose.models.EmailDispatchLock as mongoose.Model<IEmailDispatchLock>) ||
    mongoose.model<IEmailDispatchLock>("EmailDispatchLock", EmailDispatchLockSchema)

export default EmailDispatchLock
