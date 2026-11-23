import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { AD_TRACKING_VIEW_ROLES } from "@/constants/adTrackingRoles"
import { adKindFromSegment } from "@/constants/adTracking"
import { errorResponse, LeadSourceError } from "@/lib/lead-sources/http"
import { parsePage } from "@/lib/lead-sources/listQuery"
import { listRecordLeads } from "@/lib/ad-tracking/records"

/**
 * GET /api/admin/operations/ad-tracking/:kind/:id/leads?page=
 *
 * The leads of one record, newest form first. For a campaign, that is the
 * leads of the campaign, of its ad sets and of their ads. Region-scoped.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
    try {
        await requireRole(req, AD_TRACKING_VIEW_ROLES)
        await dbConnect()

        const { kind: segment, id } = await context.params
        const kind = adKindFromSegment(segment)
        if (!kind) throw new LeadSourceError("Not found.", 404)

        const { searchParams } = new URL(req.url)
        const page = parsePage(searchParams.get("page"))
        const limit = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("limit"))) || 20))

        const { leads, total } = await listRecordLeads(kind, id, page, limit)

        return NextResponse.json({
            success: true,
            data: leads,
            pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the leads")
    }
}
