import { Types } from "mongoose"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import EmailDispatchLock from "@/models/EmailDispatchLock"
import EmailAudience, { type IEmailAudience } from "@/models/EmailAudience"
import { runWithoutRegionScope } from "@/lib/region-scope"
import { CAMPAIGN_STATUS } from "@/constants/emailStatus"
import { transitionCampaign } from "@/lib/email/campaign/transition"
import { buildSnapshot } from "@/lib/email/campaign/snapshot"
import { getQueue } from "@/lib/email/queue"
import { runSweeper } from "./sweeper"

/**
 * The heartbeat's target: find campaigns that are due and start them.
 *
 * ## It runs outside the region scope
 *
 * This is a system process, not a signed-in person. It has to see due
 * campaigns in every region in one pass, so it runs inside
 * `runWithoutRegionScope`, the same bypass `getUserFromRequest` already
 * uses to look up the user that establishes the scope.
 *
 * ## One at a time
 *
 * Two heartbeats 200 ms apart would both find the same due campaign and
 * both start building its snapshot. A lease on one lock document settles
 * it: the first wins, the second returns "skipped". The lease expires on
 * its own, so a dispatcher that dies does not block the next tick for
 * ever.
 */

export const LOCK_ID = "dispatch"

/** Long enough for a snapshot, short enough to recover inside two ticks. */
const LEASE_MS = 55_000

export interface DispatchResult {
    skipped: boolean
    started: string[]
    failed: Array<{ campaignId: string; reason: string }>
    resumed: number
    swept: {
        expiredLeases: number
        retriesReady: number
        closed: number
    } | null
}

export async function runDispatcher(): Promise<DispatchResult> {
    const result: DispatchResult = {
        skipped: false,
        started: [],
        failed: [],
        resumed: 0,
        swept: null,
    }

    const owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()

    const lock = await claimLock(owner, now)

    if (!lock) {
        result.skipped = true
        return result
    }

    try {
        await runWithoutRegionScope(async () => {
            /* ---- 1. Campaigns whose time has come ---- */

            const due = await EmailCampaign.find({
                status: CAMPAIGN_STATUS.SCHEDULED,
                scheduledAt: { $ne: null, $lte: now },
            })
                .sort({ scheduledAt: 1 })
                .limit(10)
                .lean<IEmailCampaign[]>()

            for (const campaign of due) {
                try {
                    await startCampaign(campaign)
                    result.started.push(String(campaign._id))
                } catch (error) {
                    const reason =
                        error instanceof Error ? error.message : "Could not start"

                    result.failed.push({
                        campaignId: String(campaign._id),
                        reason,
                    })

                    await EmailCampaign.updateOne(
                        { _id: campaign._id },
                        {
                            $set: {
                                status: CAMPAIGN_STATUS.FAILED,
                                failureReason: reason,
                                finishedAt: new Date(),
                            },
                        }
                    )
                }
            }

            /* ---- 2. Campaigns that are sending but idle ---- */

            // A worker can die, or its wake-up can be lost. Nothing is
            // stuck for longer than one heartbeat, because this finds any
            // SENDING campaign with work left and wakes a worker for it.
            result.resumed = await resumeStalled()

            /* ---- 3. Leases, retries and closing out ---- */

            result.swept = await runSweeper(now)
        })
    } finally {
        await releaseLock(owner)
    }

    return result
}

/**
 * Builds the recipient snapshot and moves the campaign to SENDING.
 *
 * QUEUEING exists for the gap in the middle. Building a snapshot takes
 * time, and without a state between SCHEDULED and SENDING the next
 * heartbeat would start building the same one again.
 */
async function startCampaign(campaign: IEmailCampaign): Promise<void> {
    const campaignId = campaign._id as Types.ObjectId

    // Guarded: if another dispatcher took it, this throws and we move on.
    await transitionCampaign(campaignId, CAMPAIGN_STATUS.QUEUEING)

    const rules = await rulesFor(campaign)

    await buildSnapshot(campaign, rules)

    await transitionCampaign(campaignId, CAMPAIGN_STATUS.SENDING, {
        set: { startedAt: new Date() },
    })

    await getQueue().enqueue(
        { campaignId: String(campaignId), reason: "dispatch", hop: 0 },
        { dedupeKey: `${campaignId}:start` }
    )
}

/** The audience rules a campaign was scheduled against. */
async function rulesFor(campaign: IEmailCampaign) {
    // The snapshot taken at schedule time wins. It is what the person
    // approved, and the saved audience may have been edited since.
    if (campaign.audienceSnapshot) {
        return campaign.audienceSnapshot as never
    }

    if (campaign.audienceId) {
        const audience = await EmailAudience.findById(
            campaign.audienceId
        ).lean<IEmailAudience>()

        if (audience) return audience.rules
    }

    throw new Error("This campaign has no audience.")
}

/**
 * Wakes a worker for any campaign that is sending but has nothing
 * running.
 *
 * This is the recovery path that makes losing a queue message harmless.
 */
async function resumeStalled(): Promise<number> {
    const stalledBefore = new Date(Date.now() - 2 * 60 * 1_000)

    const campaigns = await EmailCampaign.find({
        status: CAMPAIGN_STATUS.SENDING,
        $or: [
            { lastWorkerAt: { $exists: false } },
            { lastWorkerAt: { $lte: stalledBefore } },
        ],
    })
        .select("_id")
        .limit(10)
        .lean<{ _id: Types.ObjectId }[]>()

    let woken = 0

    for (const campaign of campaigns) {
        const ok = await getQueue().enqueue(
            {
                campaignId: String(campaign._id),
                reason: "retry",
                hop: 0,
            },
            { dedupeKey: `${campaign._id}:resume:${Math.floor(Date.now() / 60_000)}` }
        )
        if (ok) woken += 1
    }

    return woken
}

/* ------------------------------------------------------------------ */
/* The lock                                                            */
/* ------------------------------------------------------------------ */

async function claimLock(owner: string, now: Date): Promise<boolean> {
    const claimed = await EmailDispatchLock.findOneAndUpdate(
        {
            _id: LOCK_ID,
            // Free when nobody holds it, or when the holder's lease died.
            $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
        },
        {
            $set: {
                leaseUntil: new Date(now.getTime() + LEASE_MS),
                owner,
                releasedAt: null,
            },
        },
        { upsert: true, returnDocument: "after" }
    )
        .lean<{ owner: string }>()
        .catch((error: { code?: number }) => {
            // Upsert racing with another upsert on the same _id. The other
            // one won, which is the correct outcome.
            if (error?.code === 11000) return null
            throw error
        })

    return claimed?.owner === owner
}

async function releaseLock(owner: string): Promise<void> {
    // Guarded on the owner so a slow dispatcher cannot release a lock that
    // has since been taken over by a later one.
    await EmailDispatchLock.updateOne(
        { _id: LOCK_ID, owner },
        { $set: { leaseUntil: null, releasedAt: new Date() } }
    )
}
