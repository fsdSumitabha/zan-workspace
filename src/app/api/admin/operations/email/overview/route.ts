import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES, canAdministerEmail } from "@/constants/emailRoles"
import EmailSenderIdentity from "@/models/EmailSenderIdentity"
import EmailSuppression from "@/models/EmailSuppression"
import EmailCampaign from "@/models/EmailCampaign"
import { pinnedRegion, regionsInView } from "@/lib/email/region"
import { errorResponse } from "@/lib/email/http"
import {
    deliverySettings,
    schedulePrecisionMinutes,
} from "@/lib/email/config/deliveryConfig"
import {
    getProvider,
    providerCapabilities,
} from "@/lib/email/config/providerConfig"
import { CAMPAIGN_STATUS } from "@/constants/emailStatus"

/**
 * GET /api/admin/operations/email/overview
 *
 * What the Overview screen needs while the module is being built: whether
 * the setup is finished, and the campaign counts once there are any.
 *
 * The delivery figures are deliberately not invented. Until campaigns can
 * be created, every count here is a real count of zero rows, not a
 * placeholder.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        /**
         * Counts merge across regions, so this screen works on "all
         * regions" and every query below is filtered automatically by
         * regionScopePlugin. No explicit region is passed, and none is
         * demanded.
         *
         * The limits are the same everywhere now: they come from
         * DELIVERY_LIMITS in code, not from a row. The kill switch is
         * still per region, so the connection block is only read when the
         * session is pinned to one region.
         */
        const region = pinnedRegion()
        const delivery = deliverySettings()

        const [provider, identityCount, suppressionCount, statusCounts] =
            await Promise.all([
                region ? getProvider(region) : null,
                EmailSenderIdentity.countDocuments({}),
                EmailSuppression.countDocuments({}),
                EmailCampaign.aggregate<{ _id: number; n: number }>([
                    { $group: { _id: "$status", n: { $sum: 1 } } },
                ]),
            ])

        const byStatus = new Map(statusCounts.map((r) => [r._id, r.n]))
        const count = (s: number) => byStatus.get(s) ?? 0

        const capability = provider ? providerCapabilities(provider.host) : null

        return NextResponse.json({
            success: true,
            data: {
                // Null means "several regions in view". The screen then
                // hides the per-region facts rather than showing one
                // region's numbers under a heading that covers three.
                region,
                regionsInView: regionsInView(),
                setup: {
                    providerReady: Boolean(provider?.hasPassword),
                    providerName: provider?.name ?? "",
                    identityReady: identityCount > 0,
                    killSwitch: provider?.killSwitch ?? false,
                    killSwitchReason: provider?.killSwitchReason ?? "",
                    lastTestOk: provider?.lastTestOk ?? null,
                    lastTestMessage: provider?.lastTestMessage ?? "",
                },
                capability: capability
                    ? {
                          reportsDelivery: capability.reportsDelivery,
                          reportsBounces: capability.reportsBounces,
                          note: capability.note,
                      }
                    : null,
                campaigns: {
                    total: statusCounts.reduce((a, r) => a + r.n, 0),
                    draft: count(CAMPAIGN_STATUS.DRAFT),
                    scheduled: count(CAMPAIGN_STATUS.SCHEDULED),
                    sending:
                        count(CAMPAIGN_STATUS.SENDING) +
                        count(CAMPAIGN_STATUS.QUEUEING),
                    completed:
                        count(CAMPAIGN_STATUS.COMPLETED) +
                        count(CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES),
                    failed:
                        count(CAMPAIGN_STATUS.FAILED) + count(CAMPAIGN_STATUS.HALTED),
                },
                suppressionCount,
                schedulePrecisionMinutes: schedulePrecisionMinutes(delivery),
                sendRatePerSecond: delivery.globalPerSecond,
                dailyBudget: delivery.globalPerDay,
                canAdminister: canAdministerEmail(user.role),
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the email overview")
    }
}
