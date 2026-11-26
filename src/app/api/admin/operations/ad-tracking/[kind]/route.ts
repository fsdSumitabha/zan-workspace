import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { AD_TRACKING_VIEW_ROLES } from "@/constants/adTrackingRoles"
import { adKindFromSegment } from "@/constants/adTracking"
import { errorResponse, LeadSourceError } from "@/lib/lead-sources/http"
import { parsePage } from "@/lib/lead-sources/listQuery"
import { listRecords, type ListSort } from "@/lib/ad-tracking/records"

const SORTS: ListSort[] = ["recent", "leads", "name"]

/**
 * GET /api/admin/operations/ad-tracking/:kind
 *
 * :kind is campaigns, ad-sets, ads or forms.
 * Query: search, sort (recent | leads | name), page, limit.
 *
 * One page of records, each with its parents and its lead counts. The lead
 * counts are region-scoped: only leads the viewer can see are counted.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ kind: string }> }) {
    try {
        await requireRole(req, AD_TRACKING_VIEW_ROLES)
        await dbConnect()

        const { kind: segment } = await context.params
        const kind = adKindFromSegment(segment)
        if (!kind) throw new LeadSourceError("Not found.", 404)

        const { searchParams } = new URL(req.url)
        const page = parsePage(searchParams.get("page"))
        const limit = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("limit"))) || 25))
        const rawSort = searchParams.get("sort") as ListSort
        const sort = SORTS.includes(rawSort) ? rawSort : "recent"

        const { rows, total } = await listRecords(kind, {
            search: searchParams.get("search") ?? undefined,
            page,
            limit,
            sort,
        })

        return NextResponse.json({
            success: true,
            data: rows,
            pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the list")
    }
}
