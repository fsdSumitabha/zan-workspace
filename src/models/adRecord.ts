import { Schema, type Types } from "mongoose"
import { AD_PLATFORMS, type AdPlatform } from "@/constants/adTracking"

/**
 * Fields every ad record shares: AdCampaign, AdSet, Ad and LeadForm.
 *
 * ## One row per platform id
 *
 * `platform` + `externalId` is unique. A campaign id seen on 80 rows of a
 * sheet, or in 12 sheets, is still one row. The import writes with upserts
 * on this pair, and the unique index stops a second row even when two
 * imports run at the same moment.
 *
 * ## Fields for later
 *
 * `status`, `adAccountId` and `syncedAt`, and the extra fields on each
 * model, are empty today. A sheet export does not carry them. They are
 * there so a Meta Marketing API sync can fill them without a schema change.
 * See docs/ad-tracking.md section 7.
 *
 * Not region-scoped. One campaign can bring leads for more than one region,
 * and the unique index is global. The lead counts shown next to a record
 * come from Lead queries, which are region-scoped.
 */

export interface IAdRecord {
    platform: AdPlatform
    /** The platform's own id, as text. Meta ids are 15 to 18 digits, too long for a JS number. */
    externalId: string
    /** The newest name seen. */
    name: string
    /** Every name this record was seen with, so a renamed campaign is still found by its old name. */
    aliases: string[]

    /** The platform's status, such as ACTIVE or PAUSED. Filled by an API sync. */
    status?: string
    /** The ad account, such as "act_1234567890". Filled by an API sync. */
    adAccountId?: string
    /** When an API sync last updated this record. Null when it was only seen in sheets. */
    syncedAt?: Date | null

    /** The newest lead time (created_time) of any row that named this record. Decides which name wins. */
    lastSeenAt?: Date | null

    /** The person whose import created this record. */
    createdBy?: Types.ObjectId
    /** The import that created this record. */
    importId?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

export const adRecordFields = {
    platform: { type: String, enum: AD_PLATFORMS, required: true },
    externalId: { type: String, required: true, trim: true },
    name: { type: String, default: "", trim: true },
    aliases: { type: [String], default: [] },

    status: String,
    adAccountId: String,
    syncedAt: { type: Date, default: null },

    lastSeenAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    importId: { type: Schema.Types.ObjectId, ref: "LeadImport" },
}

/** The unique index and the list-page indexes every ad record needs. */
export function addAdRecordIndexes(schema: Schema): void {
    schema.index({ platform: 1, externalId: 1 }, { unique: true })
    schema.index({ lastSeenAt: -1 })
    schema.index({ name: 1 })
}
