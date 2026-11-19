import { NextRequest } from "next/server"
import type { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES } from "@/constants/emailRoles"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import EmailDeliveryAttempt, {
    type IEmailDeliveryAttempt,
} from "@/models/EmailDeliveryAttempt"
import { EmailError, errorResponse, isObjectId } from "@/lib/email/http"
import { CAMPAIGN_STATUS } from "@/constants/emailStatus"
import { recountCampaign } from "@/lib/email/campaign/close"
import { buildCampaignReport } from "@/lib/email/report/aggregate"
import { reportsDelivery } from "@/lib/email/report/provider"
import {
    attachmentHeader,
    buildCampaignWorkbook,
    XLSX_MIME,
    type AttemptExportRow,
    type RecipientExportRow,
} from "@/lib/email/report/workbook"

/**
 * How many rows one export may contain.
 *
 * This runs in a serverless function with a fixed memory limit, and the
 * whole workbook is built in memory before a byte is sent. The planned
 * volume is under 100 recipients, so these caps are far above anything
 * expected; they exist so that a mistake cannot take the function down.
 *
 * When a cap is hit the file still downloads, and the summary sheet says
 * the list was cut and at what number. A truncated file that admits it is
 * better than a failed download.
 */
const RECIPIENT_CAP = 50_000
const ATTEMPT_CAP = 100_000

/**
 * GET /api/admin/operations/email/campaigns/:id/export
 *
 * The campaign report as a .xlsx, six sheets.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
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

        const [deliveryConfirmed, recipientRows, attemptRows] =
            await Promise.all([
                reportsDelivery(campaign.region),

                CampaignRecipient.find({ campaignId })
                    .sort({ status: 1, email: 1 })
                    .limit(RECIPIENT_CAP)
                    .select(
                        "email name status sourceType attempts submittedAt " +
                        "finishedAt openCount clickCount lastError lastSmtpCode"
                    )
                    .lean<ICampaignRecipient[]>(),

                EmailDeliveryAttempt.find({ campaignId })
                    .sort({ startedAt: 1 })
                    .limit(ATTEMPT_CAP)
                    .select(
                        "recipientId attemptNo startedAt durationMs outcome " +
                        "smtpCode smtpResponse errorClass errorMessage workerId"
                    )
                    .lean<IEmailDeliveryAttempt[]>(),
            ])

        const report = await buildCampaignReport(campaign, {
            deliveryConfirmed,
        })

        const recipients: RecipientExportRow[] = recipientRows.map((r) => ({
            email: r.email,
            name: r.name ?? "",
            status: r.status,
            sourceType: r.sourceType,
            attempts: r.attempts ?? 0,
            submittedAt: r.submittedAt?.toISOString() ?? null,
            finishedAt: r.finishedAt?.toISOString() ?? null,
            openCount: r.openCount ?? 0,
            clickCount: r.clickCount ?? 0,
            lastError: r.lastError ?? "",
            lastSmtpCode: r.lastSmtpCode ?? null,
        }))

        /**
         * Attempts store a recipient id, not an address.
         *
         * The addresses are already in memory from the query above, so
         * this is a lookup rather than a second query. An attempt whose
         * recipient is not in the capped page keeps an empty address
         * instead of being dropped, because the attempt still happened.
         */
        const emailById = new Map(
            recipientRows.map((r) => [String(r._id), r.email])
        )

        const attempts: AttemptExportRow[] = attemptRows.map((a) => ({
            email: emailById.get(String(a.recipientId)) ?? "",
            attemptNo: a.attemptNo,
            startedAt: a.startedAt.toISOString(),
            durationMs: a.durationMs ?? null,
            outcome: a.outcome,
            smtpCode: a.smtpCode ?? null,
            smtpResponse: a.smtpResponse ?? "",
            errorClass: a.errorClass ?? null,
            errorMessage: a.errorMessage ?? "",
            workerId: a.workerId,
        }))

        const buffer = await buildCampaignWorkbook({
            report,
            recipients,
            attempts,
            exportedBy: user.name ?? user.email ?? "",
            exportedAt: new Date(),
            truncated: {
                recipients:
                    recipientRows.length >= RECIPIENT_CAP
                        ? RECIPIENT_CAP
                        : null,
                attempts:
                    attemptRows.length >= ATTEMPT_CAP ? ATTEMPT_CAP : null,
            },
        })

        return new Response(new Uint8Array(buffer), {
            headers: {
                "Content-Type": XLSX_MIME,
                "Content-Disposition": attachmentHeader(
                    `${fileSafe(campaign.name)}-report.xlsx`
                ),
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to build the export")
    }
}

/** A campaign name that is safe as a file name on every platform. */
function fileSafe(name: string): string {
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)

    return cleaned || "campaign"
}
