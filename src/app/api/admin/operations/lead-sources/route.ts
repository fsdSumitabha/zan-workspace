import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import LeadSource from "@/models/LeadSource"
import User from "@/models/User"
import { errorResponse } from "@/lib/lead-sources/http"
import { countFilters, listPipeline, parseListParams } from "@/lib/lead-sources/listQuery"
import { serializeRow, type RawSourceRow } from "@/lib/lead-sources/serialize"

/**
 * GET /api/admin/operations/lead-sources
 *
 * One page of one view, plus the counts for every view tab. See
 * src/lib/lead-sources/listQuery.ts for what each view holds.
 *
 * Query: view, today, day, status, assignee, upload, search, page, limit.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_ACCESS_ROLES)
        await dbConnect()

        const params = parseListParams(new URL(req.url).searchParams, user)
        const now = new Date()
        const filters = countFilters(params, user, now)

        const [rows, today, upcoming, unscheduled, closed, all, callbacksDue, progressTotal, progressWorked] =
            await Promise.all([
                LeadSource.aggregate<RawSourceRow>(listPipeline(params, user, User.collection.name, now)),
                LeadSource.countDocuments(filters.today),
                LeadSource.countDocuments(filters.upcoming),
                LeadSource.countDocuments(filters.unscheduled),
                LeadSource.countDocuments(filters.closed),
                LeadSource.countDocuments(filters.all),
                LeadSource.countDocuments(filters.callbacksDue),
                LeadSource.countDocuments(filters.progressTotal),
                LeadSource.countDocuments(filters.progressWorked),
            ])

        const counts = { today, upcoming, unscheduled, closed, all, callbacksDue }

        const total =
            params.view === "day"
                ? await LeadSource.countDocuments({ $and: [filters.all, { allottedDay: params.day }] })
                : counts[params.view as keyof typeof counts]

        return NextResponse.json({
            success: true,
            data: rows.map(serializeRow),
            pagination: {
                page: params.page,
                limit: params.limit,
                total,
                pages: Math.max(1, Math.ceil(total / params.limit)),
            },
            counts,
            progress: { total: progressTotal, worked: progressWorked },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load lead sources")
    }
}
