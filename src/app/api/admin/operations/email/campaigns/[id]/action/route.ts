import { NextRequest, NextResponse } from "next/server"
import { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_MANAGE_ROLES } from "@/constants/emailRoles"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import EmailAudience, { type IEmailAudience } from "@/models/EmailAudience"
import EmailSenderIdentity from "@/models/EmailSenderIdentity"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
} from "@/lib/email/http"
import { CAMPAIGN_STATUS } from "@/constants/emailStatus"
import { transitionCampaign } from "@/lib/email/campaign/transition"
import { buildSnapshot } from "@/lib/email/campaign/snapshot"
import { cancelOutstanding, recountCampaign } from "@/lib/email/campaign/close"
import { serializeCampaign } from "@/lib/email/campaign/serialize"
import { previewAudience } from "@/lib/email/audience/preview"
import { getQueue } from "@/lib/email/queue"
import { wallTimeToUtc, normalizeTimeZone } from "@/lib/time/zone"
import {
    deliverySettings,
    schedulePrecisionMinutes,
} from "@/lib/email/config/deliveryConfig"
import type { CampaignActionResult } from "@/types/email"

/**
 * POST /api/admin/operations/email/campaigns/[id]/action
 *
 * Every lifecycle change in one place: schedule, send now, pause, resume,
 * cancel, archive.
 *
 * ## Why one route rather than six
 *
 * All six do the same thing: check the move is allowed, do the side
 * effect, record it. Keeping them together means the guard cannot be
 * forgotten on the seventh, and the state machine is applied once.
 *
 * None of them sets `status` directly. transitionCampaign does, with a
 * filter on the statuses the target is reachable from, so two people
 * acting at once produce one outcome.
 */

type Action =
    | "schedule"
    | "unschedule"
    | "send-now"
    | "pause"
    | "resume"
    | "cancel"
    | "archive"

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const { id } = await params
        if (!isObjectId(id)) {
            throw new EmailError("That campaign was not found.", 404)
        }

        const campaign = await EmailCampaign.findById(id).lean<IEmailCampaign>()
        if (!campaign) {
            throw new EmailError("That campaign was not found.", 404)
        }

        const body = await readJson(req)
        const action = String(body.action ?? "") as Action

        switch (action) {
            case "schedule":
                return NextResponse.json({
                    success: true,
                    data: await schedule(campaign, body),
                })
            case "unschedule":
                return NextResponse.json({
                    success: true,
                    data: await simple(
                        campaign,
                        CAMPAIGN_STATUS.DRAFT,
                        "Back to draft.",
                        { scheduledAt: null }
                    ),
                })
            case "send-now":
                return NextResponse.json({
                    success: true,
                    data: await sendNow(campaign, user.id),
                })
            case "pause":
                return NextResponse.json({
                    success: true,
                    data: await simple(
                        campaign,
                        CAMPAIGN_STATUS.PAUSED,
                        "Paused. Emails already being sent will finish.",
                        {},
                        user.id
                    ),
                })
            case "resume":
                return NextResponse.json({
                    success: true,
                    data: await resume(campaign),
                })
            case "cancel":
                return NextResponse.json({
                    success: true,
                    data: await cancel(campaign, user.id),
                })
            case "archive":
                return NextResponse.json({
                    success: true,
                    data: await simple(
                        campaign,
                        CAMPAIGN_STATUS.ARCHIVED,
                        "Archived.",
                        { archivedAt: new Date() }
                    ),
                })
            default:
                throw new EmailError(`Unknown action "${action}".`, 400, {
                    field: "action",
                })
        }
    } catch (error) {
        return errorResponse(error, "The campaign could not be changed")
    }
}

/* ------------------------------------------------------------------ */

async function schedule(
    campaign: IEmailCampaign,
    body: Record<string, unknown>
): Promise<CampaignActionResult> {
    await assertReadyToSend(campaign)

    const wall = readString(body, "scheduleWall", 32)
    const zone = normalizeTimeZone(body.scheduleZone)

    if (!wall || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) {
        throw new EmailError("Pick a date and a time.", 400, {
            field: "scheduleWall",
        })
    }

    if (!zone) {
        throw new EmailError("Pick a time zone.", 400, { field: "scheduleZone" })
    }

    /**
     * The wall time is resolved against the zone's offset on that date, so
     * daylight saving is handled rather than assumed away. A time that does
     * not exist, such as 2:30 AM on a spring-forward night, comes back null
     * and is refused here rather than silently shifted.
     */
    const scheduledAt = wallTimeToUtc(wall, zone)

    if (!scheduledAt) {
        throw new EmailError(
            `${wall.replace("T", " ")} does not exist in ${zone}. The clocks ` +
            "change that night. Pick another time.",
            400,
            { field: "scheduleWall" }
        )
    }

    if (scheduledAt.getTime() <= Date.now()) {
        throw new EmailError(
            "That time has already passed. Pick a later one, or use Send now.",
            400,
            { field: "scheduleWall" }
        )
    }

    // The audience as it is now, frozen onto the campaign. The saved
    // audience can be edited later; this campaign keeps what was approved.
    const rules = await rulesFor(campaign)
    const preview = await previewAudience(rules, { region: campaign.region })

    if (preview.eligibleTotal === 0) {
        throw new EmailError(
            "This campaign has no recipients. Check the audience.",
            400
        )
    }

    const { campaign: updated } = await transitionCampaign(
        campaign._id as Types.ObjectId,
        CAMPAIGN_STATUS.SCHEDULED,
        {
            set: {
                scheduledAt,
                scheduleWall: wall,
                scheduleZone: zone,
                sendImmediately: false,
                audienceSnapshot: rules,
                "counts.total": preview.eligibleTotal,
            },
        }
    )

    const settings = deliverySettings()
    const precision = schedulePrecisionMinutes(settings)

    return {
        campaign: serializeCampaign(updated),
        recipients: preview.eligibleTotal,
        message:
            `Scheduled for ${wall.replace("T", " ")} ${zone}. It will go out ` +
            `within about ${precision} minutes of that time.`,
    }
}

/**
 * Starts a campaign immediately.
 *
 * No scheduler is involved. The snapshot is built here and a worker is
 * woken straight away, which is why "send now" works the same on any host
 * and does not depend on the heartbeat at all.
 */
async function sendNow(
    campaign: IEmailCampaign,
    userId: string
): Promise<CampaignActionResult> {
    await assertReadyToSend(campaign)

    const campaignId = campaign._id as Types.ObjectId
    const rules = await rulesFor(campaign)

    await transitionCampaign(campaignId, CAMPAIGN_STATUS.QUEUEING, {
        set: {
            sendImmediately: true,
            scheduledAt: new Date(),
            audienceSnapshot: rules,
        },
        userId,
    })

    let snapshot
    try {
        snapshot = await buildSnapshot({ ...campaign, _id: campaignId }, rules)
    } catch (error) {
        // Back to draft rather than stuck in QUEUEING, so it can be fixed
        // and tried again.
        await transitionCampaign(campaignId, CAMPAIGN_STATUS.FAILED, {
            set: {
                failureReason:
                    error instanceof Error ? error.message : "Could not start",
            },
            force: true,
        })
        throw error
    }

    const { campaign: updated } = await transitionCampaign(
        campaignId,
        CAMPAIGN_STATUS.SENDING,
        { set: { startedAt: new Date() } }
    )

    await getQueue().enqueue(
        { campaignId: String(campaignId), reason: "dispatch", hop: 0 },
        { dedupeKey: `${campaignId}:start` }
    )

    return {
        campaign: serializeCampaign(updated),
        recipients: snapshot.total,
        message: `Sending to ${snapshot.total} recipient${snapshot.total === 1 ? "" : "s"}.`,
    }
}

async function resume(campaign: IEmailCampaign): Promise<CampaignActionResult> {
    const campaignId = campaign._id as Types.ObjectId

    const { campaign: updated } = await transitionCampaign(
        campaignId,
        CAMPAIGN_STATUS.SENDING,
        { set: { haltedReason: undefined } }
    )

    await getQueue().enqueue({
        campaignId: String(campaignId),
        reason: "retry",
        hop: 0,
    })

    return {
        campaign: serializeCampaign(updated),
        message: "Sending again.",
    }
}

async function cancel(
    campaign: IEmailCampaign,
    userId: string
): Promise<CampaignActionResult> {
    const campaignId = campaign._id as Types.ObjectId

    const { campaign: updated } = await transitionCampaign(
        campaignId,
        CAMPAIGN_STATUS.CANCELLED,
        { userId }
    )

    // Unsent recipients are cancelled. Ones a worker is mid-send on are
    // left alone, so their real outcome is recorded rather than overwritten.
    const cancelled = await cancelOutstanding(campaignId)
    await recountCampaign(campaignId)

    return {
        campaign: serializeCampaign(updated),
        recipients: cancelled,
        message:
            cancelled > 0
                ? `Cancelled. ${cancelled} recipient${cancelled === 1 ? "" : "s"} will not be sent to.`
                : "Cancelled.",
    }
}

async function simple(
    campaign: IEmailCampaign,
    to: number,
    message: string,
    set: Record<string, unknown> = {},
    userId?: string
): Promise<CampaignActionResult> {
    const { campaign: updated } = await transitionCampaign(
        campaign._id as Types.ObjectId,
        to as never,
        { set, userId }
    )

    return { campaign: serializeCampaign(updated), message }
}

/* ------------------------------------------------------------------ */

/**
 * Everything that must be true before a campaign can go out.
 *
 * Checked here rather than at creation, because a draft is allowed to be
 * incomplete. This is the gate, and the messages name the thing to fix.
 */
async function assertReadyToSend(campaign: IEmailCampaign): Promise<void> {
    if (!campaign.subject?.trim()) {
        throw new EmailError("Add a subject line first.", 400, {
            field: "subject",
        })
    }

    if (!campaign.templateVersionId) {
        throw new EmailError("Pick a template first.", 400, {
            field: "templateId",
        })
    }

    if (!campaign.audienceId && !campaign.audienceSnapshot) {
        throw new EmailError("Pick an audience first.", 400, {
            field: "audienceId",
        })
    }

    const identityId = campaign.senderIdentityId
    const identity = identityId
        ? await EmailSenderIdentity.findById(identityId).lean()
        : await EmailSenderIdentity.findOne({ region: campaign.region }).lean()

    if (!identity) {
        throw new EmailError(
            "There is no sender identity, so there is no address to send " +
            "from. Add one in Email Marketing, Settings.",
            400,
            { field: "senderIdentityId" }
        )
    }
}

async function rulesFor(campaign: IEmailCampaign) {
    if (campaign.audienceId) {
        const audience = await EmailAudience.findById(
            campaign.audienceId
        ).lean<IEmailAudience>()

        if (audience) return audience.rules
    }

    if (campaign.audienceSnapshot) return campaign.audienceSnapshot as never

    throw new EmailError("This campaign has no audience.", 400, {
        field: "audienceId",
    })
}
