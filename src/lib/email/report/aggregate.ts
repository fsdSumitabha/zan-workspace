import type { Types } from "mongoose"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import EmailDeliveryAttempt from "@/models/EmailDeliveryAttempt"
import EmailTrackingEvent from "@/models/EmailTrackingEvent"
import {
    ERROR_CLASS,
    RECIPIENT_STATUS,
    TRACKING_EVENT,
    type ErrorClass,
} from "@/constants/emailStatus"

/**
 * The numbers behind a campaign report.
 *
 * ## Rates are computed from a stated base
 *
 * Every rate here says what it is a share of. "Open rate" with no base is
 * the most common way email reporting misleads: a figure over accepted
 * mail and a figure over delivered mail are different numbers, and the
 * difference is exactly the mail that bounced.
 *
 * Where the provider cannot confirm delivery, the delivery-based rates are
 * null rather than zero, and the UI says why.
 */

export interface CampaignReport {
    campaignId: string
    name: string
    subject: string
    status: number

    totals: {
        recipients: number
        accepted: number
        delivered: number
        failed: number
        bounced: number
        suppressed: number
        cancelled: number
        unknown: number
        stillToSend: number
    }

    engagement: {
        uniqueOpens: number
        totalOpens: number
        uniqueClicks: number
        totalClicks: number
        unsubscribes: number
        complaints: number
    }

    /**
     * Each rate with the base it was computed over, so a number can never
     * be read against the wrong denominator.
     */
    rates: {
        acceptedOfRecipients: number
        failedOfRecipients: number
        bouncedOfAccepted: number | null
        /** Null when the provider does not confirm delivery. */
        deliveredOfAccepted: number | null
        openedOfAccepted: number | null
        clickedOfAccepted: number | null
        clickedOfOpened: number | null
        unsubscribedOfAccepted: number | null
    }

    /** Whether the provider confirms deliveries at all. */
    deliveryConfirmed: boolean

    timing: {
        startedAt: string | null
        finishedAt: string | null
        durationMs: number | null
        /** Emails accepted per second over the whole run. */
        throughput: number | null
    }

    latency: {
        samples: number
        p50: number
        p95: number
        p99: number
    }

    /** Why sends failed, most common first. */
    failures: Array<{
        errorClass: number
        label: string
        count: number
        example: string
    }>

    /** Which links were clicked, most clicked first. */
    links: Array<{ url: string; clicks: number; uniqueClicks: number }>
}

const ERROR_LABELS: Record<number, string> = {
    [ERROR_CLASS.PERMANENT]: "Address rejected",
    [ERROR_CLASS.TRANSIENT]: "Temporary problem",
    [ERROR_CLASS.THROTTLE]: "Provider throttled us",
    [ERROR_CLASS.AUTH]: "Sign-in refused",
    [ERROR_CLASS.UNKNOWN]: "Unrecognised error",
}

export async function buildCampaignReport(
    campaign: IEmailCampaign,
    options: { deliveryConfirmed: boolean }
): Promise<CampaignReport> {
    const campaignId = campaign._id as Types.ObjectId

    const [byStatus, failures, links, durations, uniqueClickers] =
        await Promise.all([
            CampaignRecipient.aggregate<{ _id: number; n: number }>([
                { $match: { campaignId } },
                { $group: { _id: "$status", n: { $sum: 1 } } },
            ]),

            CampaignRecipient.aggregate<{
                _id: number
                n: number
                example: string
            }>([
                {
                    $match: {
                        campaignId,
                        lastErrorClass: { $ne: null },
                        status: {
                            $in: [
                                RECIPIENT_STATUS.FAILED,
                                RECIPIENT_STATUS.BOUNCED,
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: "$lastErrorClass",
                        n: { $sum: 1 },
                        example: { $first: "$lastError" },
                    },
                },
                { $sort: { n: -1 } },
            ]),

            EmailTrackingEvent.aggregate<{ _id: string; n: number }>([
                { $match: { campaignId, type: TRACKING_EVENT.CLICK } },
                { $group: { _id: "$url", n: { $sum: 1 } } },
                { $sort: { n: -1 } },
                { $limit: 50 },
            ]),

            EmailDeliveryAttempt.find({ campaignId, durationMs: { $gt: 0 } })
                .select("durationMs")
                .sort({ durationMs: 1 })
                .limit(20_000)
                .lean<{ durationMs: number }[]>(),

            // Unique clicks per link: one recipient clicking the same link
            // five times is one person, and reporting it as five is how a
            // campaign looks more successful than it was.
            EmailTrackingEvent.aggregate<{ _id: string; n: number }>([
                { $match: { campaignId, type: TRACKING_EVENT.CLICK } },
                { $group: { _id: { url: "$url", r: "$recipientId" } } },
                { $group: { _id: "$_id.url", n: { $sum: 1 } } },
            ]),
        ])

    const count = (status: number) =>
        byStatus.find((s) => s._id === status)?.n ?? 0

    const recipients = byStatus.reduce((sum, s) => sum + s.n, 0)

    // Delivered recipients were accepted first; the status simply moved on.
    const delivered = count(RECIPIENT_STATUS.DELIVERED)
    const submitted = count(RECIPIENT_STATUS.SUBMITTED)
    const bounced = count(RECIPIENT_STATUS.BOUNCED)
    const accepted = submitted + delivered + bounced

    const failed = count(RECIPIENT_STATUS.FAILED)
    const suppressed = count(RECIPIENT_STATUS.SUPPRESSED)
    const cancelled = count(RECIPIENT_STATUS.CANCELLED)
    const unknown = count(RECIPIENT_STATUS.UNKNOWN_OUTCOME)
    const stillToSend =
        count(RECIPIENT_STATUS.PENDING) +
        count(RECIPIENT_STATUS.QUEUED) +
        count(RECIPIENT_STATUS.PROCESSING) +
        count(RECIPIENT_STATUS.RETRYING)

    const engagement = {
        uniqueOpens: campaign.engagement?.uniqueOpens ?? 0,
        totalOpens: campaign.engagement?.totalOpens ?? 0,
        uniqueClicks: campaign.engagement?.uniqueClicks ?? 0,
        totalClicks: campaign.engagement?.totalClicks ?? 0,
        unsubscribes: campaign.engagement?.unsubscribes ?? 0,
        complaints: campaign.engagement?.complaints ?? 0,
    }

    const values = durations.map((d) => d.durationMs)
    const at = (p: number) =>
        values.length === 0
            ? 0
            : values[Math.min(values.length - 1, Math.floor(values.length * p))]

    const startedAt = campaign.startedAt ?? null
    const finishedAt = campaign.finishedAt ?? null
    const durationMs =
        startedAt && finishedAt
            ? finishedAt.getTime() - startedAt.getTime()
            : null

    const uniqueByUrl = new Map(uniqueClickers.map((u) => [u._id, u.n]))

    return {
        campaignId: String(campaignId),
        name: campaign.name,
        subject: campaign.subject ?? "",
        status: campaign.status,

        totals: {
            recipients,
            accepted,
            delivered,
            failed,
            bounced,
            suppressed,
            cancelled,
            unknown,
            stillToSend,
        },

        engagement,

        rates: {
            acceptedOfRecipients: share(accepted, recipients),
            failedOfRecipients: share(failed, recipients),
            bouncedOfAccepted: accepted > 0 ? share(bounced, accepted) : null,
            deliveredOfAccepted: options.deliveryConfirmed
                ? share(delivered, accepted)
                : null,
            openedOfAccepted:
                accepted > 0 ? share(engagement.uniqueOpens, accepted) : null,
            clickedOfAccepted:
                accepted > 0 ? share(engagement.uniqueClicks, accepted) : null,
            clickedOfOpened:
                engagement.uniqueOpens > 0
                    ? share(engagement.uniqueClicks, engagement.uniqueOpens)
                    : null,
            unsubscribedOfAccepted:
                accepted > 0 ? share(engagement.unsubscribes, accepted) : null,
        },

        deliveryConfirmed: options.deliveryConfirmed,

        timing: {
            startedAt: startedAt ? startedAt.toISOString() : null,
            finishedAt: finishedAt ? finishedAt.toISOString() : null,
            durationMs,
            throughput:
                durationMs && durationMs > 0
                    ? Number((accepted / (durationMs / 1_000)).toFixed(2))
                    : null,
        },

        latency: {
            samples: values.length,
            p50: at(0.5),
            p95: at(0.95),
            p99: at(0.99),
        },

        failures: failures.map((f) => ({
            errorClass: f._id,
            label: ERROR_LABELS[f._id] ?? "Other",
            count: f.n,
            example: (f.example ?? "").slice(0, 200),
        })),

        links: links
            .filter((l) => l._id)
            .map((l) => ({
                url: l._id,
                clicks: l.n,
                uniqueClicks: uniqueByUrl.get(l._id) ?? 0,
            })),
    }
}

/** A percentage to one decimal place. Never divides by zero. */
function share(part: number, whole: number): number {
    if (whole <= 0) return 0
    return Number(((part / whole) * 100).toFixed(1))
}

/**
 * A compact row per campaign, for the comparison table.
 *
 * Deliberately the same rate definitions as the single-campaign report, so
 * a number does not change meaning when it moves between screens.
 */
export interface CampaignComparisonRow {
    campaignId: string
    name: string
    status: number
    sentAt: string | null
    recipients: number
    accepted: number
    failed: number
    bounced: number
    uniqueOpens: number
    uniqueClicks: number
    unsubscribes: number
    openRate: number | null
    clickRate: number | null
    bounceRate: number | null
}

export async function buildComparison(
    campaigns: IEmailCampaign[]
): Promise<CampaignComparisonRow[]> {
    if (campaigns.length === 0) return []

    const ids = campaigns.map((c) => c._id as Types.ObjectId)

    // One aggregation for every campaign, rather than one per campaign.
    const rows = await CampaignRecipient.aggregate<{
        _id: { campaignId: Types.ObjectId; status: number }
        n: number
    }>([
        { $match: { campaignId: { $in: ids } } },
        {
            $group: {
                _id: { campaignId: "$campaignId", status: "$status" },
                n: { $sum: 1 },
            },
        },
    ])

    const byCampaign = new Map<string, Map<number, number>>()
    for (const row of rows) {
        const key = String(row._id.campaignId)
        if (!byCampaign.has(key)) byCampaign.set(key, new Map())
        byCampaign.get(key)!.set(row._id.status, row.n)
    }

    return campaigns.map((campaign) => {
        const counts = byCampaign.get(String(campaign._id)) ?? new Map()
        const get = (s: number) => counts.get(s) ?? 0

        const delivered = get(RECIPIENT_STATUS.DELIVERED)
        const bounced = get(RECIPIENT_STATUS.BOUNCED)
        const accepted = get(RECIPIENT_STATUS.SUBMITTED) + delivered + bounced
        const recipients = Array.from(counts.values()).reduce(
            (a, b) => a + b,
            0
        )

        const e = campaign.engagement

        return {
            campaignId: String(campaign._id),
            name: campaign.name,
            status: campaign.status,
            sentAt: campaign.startedAt
                ? campaign.startedAt.toISOString()
                : null,
            recipients,
            accepted,
            failed: get(RECIPIENT_STATUS.FAILED),
            bounced,
            uniqueOpens: e?.uniqueOpens ?? 0,
            uniqueClicks: e?.uniqueClicks ?? 0,
            unsubscribes: e?.unsubscribes ?? 0,
            openRate: accepted > 0 ? share(e?.uniqueOpens ?? 0, accepted) : null,
            clickRate:
                accepted > 0 ? share(e?.uniqueClicks ?? 0, accepted) : null,
            bounceRate: accepted > 0 ? share(bounced, accepted) : null,
        }
    })
}
