import type { Types } from "mongoose"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailCampaign from "@/models/EmailCampaign"
import { CAMPAIGN_STATUS, RECIPIENT_STATUS } from "@/constants/emailStatus"
import { expireDeadLeases } from "@/lib/email/delivery/claim"
import { closeCampaignIfDone } from "@/lib/email/campaign/close"

/**
 * Housekeeping, run on every heartbeat inside the dispatcher's lock.
 *
 * Three jobs, in this order:
 *
 *   1. Expire dead leases. A worker that was killed leaves rows stuck in
 *      PROCESSING; they move to UNKNOWN_OUTCOME, never back to the queue.
 *   2. Nothing to do for retries: the claim query already picks up a
 *      RETRYING row once its `nextAttemptAt` has passed. This only counts
 *      them, so the dispatcher can report that work is waiting.
 *   3. Close campaigns whose recipients have all finished. A campaign
 *      whose last worker died after the final send would otherwise sit in
 *      SENDING for ever.
 */

export interface SweepResult {
    expiredLeases: number
    retriesReady: number
    closed: number
}

export async function runSweeper(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = {
        expiredLeases: 0,
        retriesReady: 0,
        closed: 0,
    }

    /* ---- 1. Dead leases ---- */

    result.expiredLeases = await expireDeadLeases(now)

    /* ---- 2. Retries whose backoff has elapsed ---- */

    result.retriesReady = await CampaignRecipient.countDocuments({
        status: RECIPIENT_STATUS.RETRYING,
        nextAttemptAt: { $lte: now },
    })

    /* ---- 3. Campaigns that have finished ---- */

    // Only ones that have been quiet for a moment. Closing a campaign a
    // worker is still writing to would race its final counter updates.
    const quietBefore = new Date(now.getTime() - 30_000)

    const candidates = await EmailCampaign.find({
        status: CAMPAIGN_STATUS.SENDING,
        $or: [
            { lastWorkerAt: { $exists: false } },
            { lastWorkerAt: { $lte: quietBefore } },
        ],
    })
        .select("_id")
        .limit(20)
        .lean<{ _id: Types.ObjectId }[]>()

    for (const campaign of candidates) {
        const closed = await closeCampaignIfDone(campaign._id)
        if (closed) result.closed += 1
    }

    return result
}
