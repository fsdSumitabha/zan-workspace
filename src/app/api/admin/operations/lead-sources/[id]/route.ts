import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import { loadSourceDetail } from "@/lib/lead-sources/detail"
import { errorResponse } from "@/lib/lead-sources/http"

/**
 * GET /api/admin/operations/lead-sources/:id
 *
 * One lead source with its sheet data and its timeline. Someone who is not a
 * manager gets a 404 for a source that is not assigned to them.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_ACCESS_ROLES)
        await dbConnect()

        const { id } = await context.params

        return NextResponse.json({ success: true, data: await loadSourceDetail(id, user) })
    } catch (error) {
        return errorResponse(error, "Failed to load the lead source")
    }
}
