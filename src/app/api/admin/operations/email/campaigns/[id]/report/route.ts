import { NextRequest, NextResponse } from "next/server"
import type { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES } from "@/constants/emailRoles"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import { EmailError, errorResponse, isObjectId } from "@/lib/email/http"
import { CAMPAIGN_STATUS } from "@/constants/emailStatus"
import { recountCampaign } from "@/lib/email/campaign/close"
import { buildCampaignReport } from "@/lib/email/report/aggregate"
import { reportsDelivery } from "@/lib/email/report/provider"

/**
 * GET /api/admin/operations/email/campaigns/:id/report
 *
 * The full report for one campaign.
 *
 * Two things are deliberate here.
 *
 * The counters on the campaign row are maintained with `$inc` while a send
 * runs, so they can drift by a few. A finished campaign is recounted from
 * the recipient rows first, because a report is something a person acts on.
 *
 * `deliveryConfirmed` comes from the provider's own capability, not from
 * the numbers. Gmail never reports a delivery, so a zero delivered count
 * means "not measured", and the report says so instead of showing 0%.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const { id } = await params

        if (!isObjectId(id)) {
            throw new EmailError("That campaign was not found.", 404)
        }

        let campaign = await EmailCampaign.findById(id).lean<IEmailCampaign>()

        if (!campaign) {
            throw new EmailError("That campaign was not found.", 404)
        }

        const campaignId = campaign._id as Types.ObjectId

        const finished =
            campaign.status === CAMPAIGN_STATUS.COMPLETED ||
            campaign.status === CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES ||
            campaign.status === CAMPAIGN_STATUS.CANCELLED

        if (finished) {
            await recountCampaign(campaignId)
            campaign =
                (await EmailCampaign.findById(
                    campaignId
                ).lean<IEmailCampaign>()) ?? campaign
        }

        const report = await buildCampaignReport(campaign, {
            deliveryConfirmed: await reportsDelivery(campaign.region),
        })

        return NextResponse.json({
            success: true,
            data: {
                report,
                // The screen tells the reader whether these numbers can
                // still change. A report of a running campaign is a
                // snapshot, and saying so avoids somebody circulating it
                // as the final figure.
                settled: finished,
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to build the report")
    }
}
