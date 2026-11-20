import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES } from "@/constants/emailRoles"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import { errorResponse } from "@/lib/email/http"
import {
    CAMPAIGN_STATUS,
    isCampaignStatus,
    type CampaignStatus,
} from "@/constants/emailStatus"
import { buildComparison } from "@/lib/email/report/aggregate"
import { reportsDeliveryByRegion } from "@/lib/email/report/provider"
import {
    attachmentHeader,
    buildComparisonWorkbook,
    XLSX_MIME,
} from "@/lib/email/report/workbook"

/**
 * Campaigns that have something to report.
 *
 * A draft has no numbers, and including drafts in a performance table
 * means every rate column reads "0%" for rows that never sent anything.
 */
const REPORTABLE: CampaignStatus[] = [
    CAMPAIGN_STATUS.SENDING,
    CAMPAIGN_STATUS.PAUSED,
    CAMPAIGN_STATUS.HALTED,
    CAMPAIGN_STATUS.COMPLETED,
    CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES,
    CAMPAIGN_STATUS.CANCELLED,
    CAMPAIGN_STATUS.ARCHIVED,
]

const MAX_ROWS = 200

/**
 * GET /api/admin/operations/email/reports
 *
 * One row per campaign, for the comparison table and its chart.
 *
 * Query: status, from, to, format=xlsx, limit.
 *
 * The rates here use the same bases as the single-campaign report, so a
 * number does not change meaning when somebody reads it on a different
 * screen.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const search = new URL(req.url).searchParams

        const rawStatus = Number(search.get("status"))
        const status =
            isCampaignStatus(rawStatus) && REPORTABLE.includes(rawStatus)
                ? rawStatus
                : null

        const limit = Math.min(
            MAX_ROWS,
            Math.max(1, Math.floor(Number(search.get("limit"))) || 50)
        )

        const filter: Record<string, unknown> = {
            status: status !== null ? status : { $in: REPORTABLE },
        }

        /**
         * The date window is on startedAt, not createdAt.
         *
         * A person asking "how did last month go" means mail that went
         * out last month, not campaigns that were drafted then.
         */
        const from = parseDate(search.get("from"))
        const to = parseDate(search.get("to"))

        if (from || to) {
            const range: Record<string, Date> = {}
            if (from) range.$gte = from
            if (to) range.$lte = to
            filter.startedAt = range
        }

        const campaigns = await EmailCampaign.find(filter)
            .sort({ startedAt: -1, createdAt: -1 })
            .limit(limit)
            .lean<IEmailCampaign[]>()

        const rows = await buildComparison(campaigns)

        // Delivery is only a real figure where the provider confirms it,
        // and regions can use different providers.
        const confirmed = await reportsDeliveryByRegion(
            campaigns.map((c) => c.region)
        )

        const withRegion = rows.map((row, i) => ({
            ...row,
            region: campaigns[i].region,
            deliveryConfirmed: confirmed.get(campaigns[i].region) ?? false,
        }))

        if (search.get("format") === "xlsx") {
            const buffer = await buildComparisonWorkbook({
                rows: withRegion,
                exportedBy: user.name ?? user.email ?? "",
                exportedAt: new Date(),
            })

            return new Response(new Uint8Array(buffer), {
                headers: {
                    "Content-Type": XLSX_MIME,
                    "Content-Disposition": attachmentHeader(
                        `email-campaigns-${stamp()}.xlsx`
                    ),
                    "Cache-Control": "no-store",
                },
            })
        }

        return NextResponse.json({
            success: true,
            data: {
                rows: withRegion,
                // Said once here rather than guessed on the screen: a
                // campaign missing from this list is missing because it
                // has not sent anything, not because it went wrong.
                reportableStatuses: REPORTABLE,
                limit,
                truncated: campaigns.length >= limit,
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the reports")
    }
}

/** A yyyy-mm-dd from the query, or null. Never NaN. */
function parseDate(value: string | null): Date | null {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function stamp(): string {
    return new Date().toISOString().slice(0, 10)
}
