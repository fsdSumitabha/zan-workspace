import mongoose, { Schema, type Types } from "mongoose"
import { addAdRecordIndexes, adRecordFields, type IAdRecord } from "./adRecord"

/**
 * One ad. Belongs to one ad set, and through it to one campaign.
 *
 *   AdCampaign  <-  AdSet  <-  Ad  ->  LeadForm
 *
 * `campaign` repeats the ad set's campaign on purpose. It lets "every ad of
 * this campaign" be one indexed query instead of two.
 *
 * `leadForm` is the form this ad opens. One form is often used by many ads,
 * so the link goes from the ad to the form, never from the form to an ad.
 * See docs/ad-tracking.md section 2.
 */
export interface IAd extends IAdRecord {
    adSet?: Types.ObjectId | null
    campaign?: Types.ObjectId | null
    leadForm?: Types.ObjectId | null

    creativeId?: string
    previewUrl?: string
}

const AdSchema = new Schema<IAd>(
    {
        ...adRecordFields,

        adSet: { type: Schema.Types.ObjectId, ref: "AdSet", default: null },
        campaign: { type: Schema.Types.ObjectId, ref: "AdCampaign", default: null },
        leadForm: { type: Schema.Types.ObjectId, ref: "LeadForm", default: null },

        creativeId: String,
        previewUrl: String,
    },
    { timestamps: true }
)

addAdRecordIndexes(AdSchema)
AdSchema.index({ adSet: 1 })
AdSchema.index({ campaign: 1 })
AdSchema.index({ leadForm: 1 })

const Ad =
    (mongoose.models.Ad as mongoose.Model<IAd>) ||
    mongoose.model<IAd>("Ad", AdSchema)

export default Ad
