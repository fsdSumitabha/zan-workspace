import mongoose, { Schema, type Types } from "mongoose"
import { addAdRecordIndexes, adRecordFields, type IAdRecord } from "./adRecord"

/**
 * An ad set. Belongs to one campaign.
 *
 *   AdCampaign  <-  AdSet  <-  Ad
 *
 * See docs/ad-tracking.md.
 */
export interface IAdSet extends IAdRecord {
    /** The campaign this ad set belongs to. Empty when the sheet had no campaign_id. */
    campaign?: Types.ObjectId | null

    optimizationGoal?: string
    billingEvent?: string
    dailyBudget?: number
    lifetimeBudget?: number
    startTime?: Date
    endTime?: Date
    /** The audience as the API returns it. Kept as it is. */
    targeting?: Record<string, unknown>
}

const AdSetSchema = new Schema<IAdSet>(
    {
        ...adRecordFields,

        campaign: { type: Schema.Types.ObjectId, ref: "AdCampaign", default: null },

        optimizationGoal: String,
        billingEvent: String,
        dailyBudget: Number,
        lifetimeBudget: Number,
        startTime: Date,
        endTime: Date,
        targeting: Schema.Types.Mixed,
    },
    { timestamps: true }
)

addAdRecordIndexes(AdSetSchema)
AdSetSchema.index({ campaign: 1 })

const AdSet =
    (mongoose.models.AdSet as mongoose.Model<IAdSet>) ||
    mongoose.model<IAdSet>("AdSet", AdSetSchema)

export default AdSet
