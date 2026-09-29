import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import { errorResponse, readJson } from "@/lib/lead-sources/http"
import { bulkAction } from "@/lib/lead-sources/mutations"

/**
 * POST /api/admin/operations/lead-sources/bulk
 *
 * Body: { ids: string[], action, ...values, today }
 *
 *   assign   { assignedTo: userId | null }      managers only
 *   day      { day: "YYYY-MM-DD" | null }       managers only
 *   status   { status, note? }                  anyone, on sources they can see
 *   delete   {}                                 managers only
 *
 * The details page uses this with one id for the same changes.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_ACCESS_ROLES)
        await dbConnect()

        const result = await bulkAction(user, await readJson(req))

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        return errorResponse(error, "Failed to update lead sources")
    }
}
