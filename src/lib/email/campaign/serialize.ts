import type { IEmailCampaign } from "@/models/EmailCampaign"
import type { CampaignStatus } from "@/constants/emailStatus"
import { nextStatuses } from "./transition"
import type { EmailCampaignRow } from "@/types/email"

/**
 * A campaign as the browser sees it.
 *
 * `allowedActions` is derived from the one transition map, so the buttons
 * a person sees and the moves the server will accept cannot drift apart. A
 * completed campaign does not show a greyed-out Pause; it does not show
 * Pause at all.
 */
export function serializeCampaign(row: IEmailCampaign): EmailCampaignRow {
    const counts = row.counts ?? ({} as IEmailCampaign["counts"])
    const engagement = row.engagement ?? ({} as IEmailCampaign["engagement"])

    const total = counts.total ?? 0
    const finished =
        (counts.submitted ?? 0) +
        (counts.delivered ?? 0) +
        (counts.failed ?? 0) +
        (counts.bounced ?? 0) +
        (counts.suppressed ?? 0) +
        (counts.cancelled ?? 0) +
        (counts.unknown ?? 0)

    return {
        _id: String(row._id),
        name: row.name,
        description: row.description ?? "",
        status: row.status,
        subject: row.subject ?? "",
        preheader: row.preheader ?? "",
        templateId: row.templateId ? String(row.templateId) : null,
        templateVersionId: row.templateVersionId
            ? String(row.templateVersionId)
            : null,
        senderIdentityId: row.senderIdentityId
            ? String(row.senderIdentityId)
            : null,
        audienceId: row.audienceId ? String(row.audienceId) : null,

        scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
        scheduleWall: row.scheduleWall ?? "",
        scheduleZone: row.scheduleZone ?? "",

        counts: {
            total,
            pending: counts.pending ?? 0,
            queued: counts.queued ?? 0,
            processing: counts.processing ?? 0,
            submitted: counts.submitted ?? 0,
            delivered: counts.delivered ?? 0,
            failed: counts.failed ?? 0,
            bounced: counts.bounced ?? 0,
            suppressed: counts.suppressed ?? 0,
            cancelled: counts.cancelled ?? 0,
            unknown: counts.unknown ?? 0,
        },
        engagement: {
            uniqueOpens: engagement.uniqueOpens ?? 0,
            totalOpens: engagement.totalOpens ?? 0,
            uniqueClicks: engagement.uniqueClicks ?? 0,
            totalClicks: engagement.totalClicks ?? 0,
            unsubscribes: engagement.unsubscribes ?? 0,
            complaints: engagement.complaints ?? 0,
        },

        /** 0 to 100. Only meaningful once a snapshot exists. */
        progress: total > 0 ? Math.round((finished / total) * 100) : 0,

        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
        haltedReason: row.haltedReason ?? "",
        failureReason: row.failureReason ?? "",

        allowedActions: nextStatuses(row.status as CampaignStatus),

        createdBy: row.createdBy ? String(row.createdBy) : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }
}
