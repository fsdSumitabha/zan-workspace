import { Types } from "mongoose"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import { RECIPIENT_STATUS } from "@/constants/emailStatus"

/**
 * Taking a bounded set of recipients for one worker to send.
 *
 * ## Why three operations and not one
 *
 * `findOneAndUpdate` is atomic but returns one document, so claiming 25
 * would be 25 round trips. `updateMany` does many in one trip but does not
 * say which documents it changed, and MongoDB has no `limit` on it.
 *
 * So: read candidate ids, update them with a status guard and stamp a
 * claim id, then read back by that claim id. Each document is still
 * updated atomically, and the guard is what makes a lost race harmless.
 *
 * ## What happens when two workers race
 *
 * Both read the same candidate ids. Both run `updateMany` filtered on
 * `status: QUEUED`. MongoDB applies them one at a time per document, so
 * the first sets the status and the second matches nothing. The loser
 * simply gets fewer jobs back, which is a normal outcome and not an error.
 *
 * Nobody is claimed twice. That is the property the tests check.
 */

export interface ClaimOptions {
    campaignId: Types.ObjectId
    /** Identifies the worker invocation. Written to the row for debugging. */
    workerId: string
    limit: number
    leaseMs: number
    now?: Date
}

export interface ClaimResult {
    jobs: ICampaignRecipient[]
    claimId: Types.ObjectId
}

/**
 * How many times a worker re-reads after losing a race.
 *
 * Concurrent workers all sort by `_id` and so all read the same candidates.
 * One wins them and the rest match nothing, which is safe but means only
 * one worker makes progress per round. Reading again picks up the rows the
 * winner has now moved past.
 *
 * Three rounds is enough for the handful of workers this design runs. It is
 * bounded on purpose: an unbounded loop against an empty queue would spin.
 */
const CLAIM_ROUNDS = 3

export async function claimRecipients(
    options: ClaimOptions
): Promise<ClaimResult> {
    const now = options.now ?? new Date()
    const claimId = new Types.ObjectId()
    const limit = Math.max(0, Math.floor(options.limit))

    if (limit === 0) return { jobs: [], claimId }

    let claimed = 0

    for (let round = 0; round < CLAIM_ROUNDS && claimed < limit; round++) {
        const want = limit - claimed

        /* 1. Candidates. */
        const candidates = await CampaignRecipient.find({
            campaignId: options.campaignId,
            $or: [
                { status: RECIPIENT_STATUS.QUEUED },
                // A retry whose backoff has elapsed is claimable again.
                {
                    status: RECIPIENT_STATUS.RETRYING,
                    nextAttemptAt: { $lte: now },
                },
            ],
        })
            .sort({ _id: 1 })
            .limit(want)
            .select("_id")
            .lean<{ _id: Types.ObjectId }[]>()

        // Nothing left for anybody. Another round would read the same
        // empty result.
        if (candidates.length === 0) break

        /* 2. Claim, guarded on the status we read. */
        const result = await CampaignRecipient.updateMany(
            {
                _id: { $in: candidates.map((c) => c._id) },
                // The guard. A document another worker already moved out of
                // these statuses will not match, so it is not claimed twice.
                status: {
                    $in: [RECIPIENT_STATUS.QUEUED, RECIPIENT_STATUS.RETRYING],
                },
            },
            {
                $set: {
                    status: RECIPIENT_STATUS.PROCESSING,
                    claimId,
                    leaseOwner: options.workerId,
                    leaseUntil: new Date(now.getTime() + options.leaseMs),
                    lastAttemptAt: now,
                },
                $inc: { attempts: 1 },
            }
        )

        claimed += result.modifiedCount ?? 0
    }

    if (claimed === 0) return { jobs: [], claimId }

    /* 3. What we actually won, across every round. */
    const jobs = await CampaignRecipient.find({ claimId })
        .lean<ICampaignRecipient[]>()

    return { jobs, claimId }
}

/**
 * Hands claimed jobs back without consuming an attempt.
 *
 * Used when a worker claimed rows and then could not send after all: the
 * campaign was paused, or the kill switch went on. Leaving them PROCESSING
 * would make them wait for the lease to expire for no reason.
 *
 * The attempt counter is decremented, because no attempt was made. Without
 * that, pausing and resuming a campaign five times would exhaust every
 * recipient's retries without a single email being sent.
 */
export async function releaseClaim(
    claimId: Types.ObjectId
): Promise<number> {
    const result = await CampaignRecipient.updateMany(
        { claimId, status: RECIPIENT_STATUS.PROCESSING },
        {
            $set: {
                status: RECIPIENT_STATUS.QUEUED,
                claimId: null,
                leaseOwner: undefined,
                leaseUntil: null,
            },
            $inc: { attempts: -1 },
        }
    )

    return result.modifiedCount ?? 0
}

/**
 * How many recipients are still waiting on this campaign.
 *
 * The worker uses it to decide whether to chain a successor, and the
 * sweeper to decide whether a campaign can be closed.
 */
export async function countOutstanding(
    campaignId: Types.ObjectId
): Promise<{ claimable: number; inFlight: number; retrying: number }> {
    const [claimable, inFlight, retrying] = await Promise.all([
        CampaignRecipient.countDocuments({
            campaignId,
            status: RECIPIENT_STATUS.QUEUED,
        }),
        CampaignRecipient.countDocuments({
            campaignId,
            status: RECIPIENT_STATUS.PROCESSING,
        }),
        CampaignRecipient.countDocuments({
            campaignId,
            status: RECIPIENT_STATUS.RETRYING,
        }),
    ])

    return { claimable, inFlight, retrying }
}

/**
 * Moves jobs whose lease has died out of PROCESSING.
 *
 * ## They go to UNKNOWN_OUTCOME, never back to QUEUED
 *
 * This is the crash-after-accept problem, and it is the one place in the
 * module where the safe answer is to do nothing. A worker that was killed
 * mid-send may have had the message accepted by the SMTP server already.
 * Putting the job back in the queue would send that person a second copy.
 *
 * So the row is parked in UNKNOWN_OUTCOME and counted on the report. We
 * cannot say whether it went out, and the honest thing is to say so rather
 * than guess in either direction. See
 * docs/EMAIL_MARKETING_ARCHITECTURE.md section 6.7.
 */
export async function expireDeadLeases(
    now: Date = new Date(),
    campaignId?: Types.ObjectId
): Promise<number> {
    const filter: Record<string, unknown> = {
        status: RECIPIENT_STATUS.PROCESSING,
        leaseUntil: { $ne: null, $lte: now },
    }
    if (campaignId) filter.campaignId = campaignId

    const result = await CampaignRecipient.updateMany(filter, {
        $set: {
            status: RECIPIENT_STATUS.UNKNOWN_OUTCOME,
            claimId: null,
            leaseUntil: null,
            finishedAt: now,
            lastError:
                "The worker stopped while this was being sent. We cannot " +
                "confirm whether it went out, so it was not sent again.",
        },
    })

    return result.modifiedCount ?? 0
}
