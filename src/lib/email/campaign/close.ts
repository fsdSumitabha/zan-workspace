import type { Types } from "mongoose"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import {
    CAMPAIGN_STATUS,
    RECIPIENT_STATUS,
    type RecipientStatus,
} from "@/constants/emailStatus"
import { transitionCampaign } from "./transition"

/**
 * Finishing a campaign, and keeping its counters honest.
 *
 * ## Why the counters are recomputed rather than trusted
 *
 * The campaign carries denormalised counts kept with `$inc`, so the list
 * screen does not aggregate every recipient row. They drift: a worker
 * killed between writing a recipient's outcome and incrementing the
 * counter leaves the two disagreeing by one.
 *
 * The recipient rows are the truth. This rebuilds the counters from them
 * whenever a campaign closes, so a finished report is always exact even if
 * the live progress bar was a little off while it ran.
 */

const STATUS_TO_FIELD: Record<number, string> = {
    [RECIPIENT_STATUS.PENDING]: "pending",
    [RECIPIENT_STATUS.QUEUED]: "queued",
    [RECIPIENT_STATUS.PROCESSING]: "processing",
    [RECIPIENT_STATUS.SUBMITTED]: "submitted",
    [RECIPIENT_STATUS.DELIVERED]: "delivered",
    [RECIPIENT_STATUS.FAILED]: "failed",
    [RECIPIENT_STATUS.BOUNCED]: "bounced",
    [RECIPIENT_STATUS.SUPPRESSED]: "suppressed",
    [RECIPIENT_STATUS.CANCELLED]: "cancelled",
    [RECIPIENT_STATUS.UNKNOWN_OUTCOME]: "unknown",
}

/** Statuses that mean nothing more will happen to this recipient. */
const TERMINAL: RecipientStatus[] = [
    RECIPIENT_STATUS.SUBMITTED,
    RECIPIENT_STATUS.DELIVERED,
    RECIPIENT_STATUS.FAILED,
    RECIPIENT_STATUS.BOUNCED,
    RECIPIENT_STATUS.SUPPRESSED,
    RECIPIENT_STATUS.CANCELLED,
    RECIPIENT_STATUS.UNKNOWN_OUTCOME,
]

export interface RecountResult {
    counts: Record<string, number>
    total: number
    outstanding: number
}

/** Rebuilds the campaign's counters from its recipient rows. */
export async function recountCampaign(
    campaignId: Types.ObjectId
): Promise<RecountResult> {
    const rows = await CampaignRecipient.aggregate<{ _id: number; n: number }>([
        { $match: { campaignId } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
    ])

    const counts: Record<string, number> = {
        total: 0,
        pending: 0,
        queued: 0,
        processing: 0,
        submitted: 0,
        delivered: 0,
        failed: 0,
        bounced: 0,
        suppressed: 0,
        cancelled: 0,
        unknown: 0,
    }

    let total = 0
    let outstanding = 0

    for (const row of rows) {
        const field = STATUS_TO_FIELD[row._id]
        if (field) counts[field] = row.n
        total += row.n

        if (!TERMINAL.includes(row._id as RecipientStatus)) {
            outstanding += row.n
        }
    }

    // RETRYING has no counter of its own; it is work still outstanding and
    // is reported through the progress bar rather than a tile.
    counts.total = total

    await EmailCampaign.updateOne({ _id: campaignId }, { $set: { counts } })

    return { counts, total, outstanding }
}

/**
 * Closes a campaign if every recipient has reached a terminal state.
 *
 * Does nothing if work remains, so it is safe for any worker to call at
 * the end of its run without checking first.
 */
export async function closeCampaignIfDone(
    campaignId: Types.ObjectId
): Promise<IEmailCampaign | null> {
    const campaign = await EmailCampaign.findById(campaignId)
        .select("status")
        .lean<{ status: number }>()

    if (!campaign) return null

    // Only a campaign that is actually running can finish. A paused or
    // cancelled one stays where it is, which is what the person asked for.
    if (campaign.status !== CAMPAIGN_STATUS.SENDING) return null

    const { counts, outstanding } = await recountCampaign(campaignId)

    if (outstanding > 0) return null

    const hadFailures =
        counts.failed > 0 || counts.bounced > 0 || counts.unknown > 0

    const { campaign: closed } = await transitionCampaign(
        campaignId,
        hadFailures
            ? CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES
            : CAMPAIGN_STATUS.COMPLETED
    )

    return closed
}

/**
 * Marks every unsent recipient as cancelled.
 *
 * Rows that are PROCESSING are left alone: a worker may be mid-send, and
 * the result of that send has to be recorded truthfully. They finish on
 * their own, or their lease expires and the sweeper parks them in
 * UNKNOWN_OUTCOME.
 */
export async function cancelOutstanding(
    campaignId: Types.ObjectId
): Promise<number> {
    const result = await CampaignRecipient.updateMany(
        {
            campaignId,
            status: {
                $in: [
                    RECIPIENT_STATUS.PENDING,
                    RECIPIENT_STATUS.QUEUED,
                    RECIPIENT_STATUS.RETRYING,
                ],
            },
        },
        {
            $set: {
                status: RECIPIENT_STATUS.CANCELLED,
                finishedAt: new Date(),
                claimId: null,
                leaseUntil: null,
            },
        }
    )

    await recountCampaign(campaignId)

    return result.modifiedCount ?? 0
}
