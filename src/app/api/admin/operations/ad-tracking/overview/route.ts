import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { AD_TRACKING_VIEW_ROLES } from "@/constants/adTrackingRoles"
import { errorResponse } from "@/lib/lead-sources/http"
import { getOverview } from "@/lib/ad-tracking/overview"

/**
 * GET /api/admin/operations/ad-tracking/overview
 *
 * Counts for the Ad Tracking front page. See src/lib/ad-tracking/overview.ts.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, AD_TRACKING_VIEW_ROLES)
        await dbConnect()

        return NextResponse.json({ success: true, data: await getOverview() })
    } catch (error) {
        return errorResponse(error, "Failed to load the overview")
    }
}
