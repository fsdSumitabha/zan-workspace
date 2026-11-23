import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { AD_TRACKING_VIEW_ROLES } from "@/constants/adTrackingRoles"
import { adKindFromSegment } from "@/constants/adTracking"
import { errorResponse, LeadSourceError } from "@/lib/lead-sources/http"
import { getRecordDetail } from "@/lib/ad-tracking/records"

/**
 * GET /api/admin/operations/ad-tracking/:kind/:id
 *
 * One campaign, ad set, ad or lead form: its parents, its lead counts by
 * status, and its children (a campaign's ad sets, an ad set's ads, the ads
 * that open a form). The leads themselves are at /:kind/:id/leads.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
    try {
        await requireRole(req, AD_TRACKING_VIEW_ROLES)
        await dbConnect()

        const { kind: segment, id } = await context.params
        const kind = adKindFromSegment(segment)
        if (!kind) throw new LeadSourceError("Not found.", 404)

        return NextResponse.json({ success: true, data: await getRecordDetail(kind, id) })
    } catch (error) {
        return errorResponse(error, "Failed to load the record")
    }
}
