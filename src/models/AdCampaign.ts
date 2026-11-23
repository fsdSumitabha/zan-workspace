import mongoose, { Schema } from "mongoose"
import { addAdRecordIndexes, adRecordFields, type IAdRecord } from "./adRecord"

/**
 * An ad campaign on an ad platform. The top of the chain:
 *
 *   AdCampaign  <-  AdSet  <-  Ad
 *
 * Named AdCampaign, not Campaign, because EmailCampaign already exists.
 * See docs/ad-tracking.md.
 */
export interface IAdCampaign extends IAdRecord {
    /** Meta: OUTCOME_LEADS, OUTCOME_TRAFFIC and so on. */
    objective?: string
    buyingType?: string
    /** In the ad account's currency, in its smallest unit, as the API sends it. */
    dailyBudget?: number
    lifetimeBudget?: number
    startTime?: Date
    stopTime?: Date
}

const AdCampaignSchema = new Schema<IAdCampaign>(
    {
        ...adRecordFields,

        objective: String,
        buyingType: String,
        dailyBudget: Number,
        lifetimeBudget: Number,
        startTime: Date,
        stopTime: Date,
    },
    { timestamps: true }
)

addAdRecordIndexes(AdCampaignSchema)

const AdCampaign =
    (mongoose.models.AdCampaign as mongoose.Model<IAdCampaign>) ||
    mongoose.model<IAdCampaign>("AdCampaign", AdCampaignSchema)

export default AdCampaign
