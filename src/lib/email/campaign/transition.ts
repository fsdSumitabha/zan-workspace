import type { Types } from "mongoose"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUS_META,
    CAMPAIGN_TRANSITIONS,
    type CampaignStatus,
} from "@/constants/emailStatus"
import { EmailError } from "@/lib/email/http"

/**
 * The only place a campaign's status changes.
 *
 * ## Why no route sets `status` directly
 *
 * Two people, or a person and the dispatcher, can act on the same campaign
 * in the same second. Pause and cancel arriving together must produce one
 * outcome, not a campaign that is cancelled but still sending.
 *
 * Every change goes through one guarded `findOneAndUpdate`, filtered on the
 * statuses the target is reachable from. MongoDB applies those one at a
 * time, so the first wins and the second is told why it could not.
 *
 * The allowed map lives in src/constants/emailStatus.ts, next to the codes,
 * so there is one description of the lifecycle rather than two that drift.
 */

export interface TransitionOptions {
    /** Extra fields to write in the same atomic update. */
    set?: Record<string, unknown>
    /** Who did it, for the ones that record a person. */
    userId?: string
    /** Skips the "is it allowed" check. Only for the sweeper closing out. */
    force?: boolean
}

export interface TransitionResult {
    campaign: IEmailCampaign
    /** The status it was in before. */
    from: CampaignStatus
}

export async function transitionCampaign(
    campaignId: Types.ObjectId | string,
    to: CampaignStatus,
    options: TransitionOptions = {}
): Promise<TransitionResult> {
    const allowedFrom = options.force
        ? (Object.keys(CAMPAIGN_TRANSITIONS).map(Number) as CampaignStatus[])
        : sourcesFor(to)

    if (allowedFrom.length === 0) {
        throw new EmailError(
            `Nothing can move a campaign to ${label(to)}.`,
            409
        )
    }

    const set: Record<string, unknown> = { status: to, ...options.set }

    // The fields that only make sense for one destination, applied here so
    // no caller has to remember them.
    const now = new Date()
    if (to === CAMPAIGN_STATUS.SENDING && !options.set?.startedAt) {
        set.startedAt = set.startedAt ?? now
    }
    if (to === CAMPAIGN_STATUS.PAUSED) {
        set.pausedAt = now
        if (options.userId) set.pausedBy = options.userId
    }
    if (to === CAMPAIGN_STATUS.CANCELLED) {
        set.cancelledAt = now
        set.finishedAt = now
        if (options.userId) set.cancelledBy = options.userId
    }
    if (to === CAMPAIGN_STATUS.HALTED) {
        set.haltedAt = now
    }
    if (
        to === CAMPAIGN_STATUS.COMPLETED ||
        to === CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES ||
        to === CAMPAIGN_STATUS.FAILED
    ) {
        set.finishedAt = now
    }

    const before = await EmailCampaign.findOneAndUpdate(
        { _id: campaignId, status: { $in: allowedFrom } },
        { $set: set },
        // The document as it was, so the caller knows what it came from.
        { returnDocument: "before" }
    ).lean<IEmailCampaign>()

    if (!before) {
        // Either the campaign is gone, or it is not in a status this change
        // is allowed from. Tell the person which, because "cannot pause a
        // campaign that already finished" is useful and "not found" is not.
        const current = await EmailCampaign.findById(campaignId)
            .select("status name")
            .lean<{ status: number; name: string }>()

        if (!current) {
            throw new EmailError("That campaign was not found.", 404)
        }

        throw new EmailError(
            `"${current.name}" is ${label(current.status as CampaignStatus)}, ` +
            `so it cannot be ${pastTense(to)}.`,
            409
        )
    }

    const after = await EmailCampaign.findById(campaignId).lean<IEmailCampaign>()

    return {
        campaign: after ?? ({ ...before, status: to } as IEmailCampaign),
        from: before.status as CampaignStatus,
    }
}

/** Whether a move is allowed, without attempting it. Drives the UI. */
export function canTransition(
    from: CampaignStatus,
    to: CampaignStatus
): boolean {
    return (CAMPAIGN_TRANSITIONS[from] ?? []).includes(to)
}

/** Every status a campaign can move to from here. Drives the action menu. */
export function nextStatuses(from: CampaignStatus): CampaignStatus[] {
    return CAMPAIGN_TRANSITIONS[from] ?? []
}

/** The statuses `to` is reachable from, derived from the one map. */
function sourcesFor(to: CampaignStatus): CampaignStatus[] {
    return (Object.entries(CAMPAIGN_TRANSITIONS) as Array<[string, CampaignStatus[]]>)
        .filter(([, targets]) => targets.includes(to))
        .map(([from]) => Number(from) as CampaignStatus)
}

function label(status: CampaignStatus): string {
    return CAMPAIGN_STATUS_META[status]?.label.toLowerCase() ?? String(status)
}

function pastTense(to: CampaignStatus): string {
    switch (to) {
        case CAMPAIGN_STATUS.SCHEDULED:
            return "scheduled"
        case CAMPAIGN_STATUS.QUEUEING:
        case CAMPAIGN_STATUS.SENDING:
            return "sent"
        case CAMPAIGN_STATUS.PAUSED:
            return "paused"
        case CAMPAIGN_STATUS.CANCELLED:
            return "cancelled"
        case CAMPAIGN_STATUS.ARCHIVED:
            return "archived"
        default:
            return `moved to ${label(to)}`
    }
}
