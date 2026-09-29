import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_MANAGE_ROLES } from "@/constants/leadSourceRoles"
import { errorResponse } from "@/lib/lead-sources/http"
import { loadUploadReport, serializeUploadReport } from "@/lib/lead-sources/uploadView"

/**
 * GET /api/admin/operations/lead-sources/uploads/:id
 *
 * One upload and its full report: every row of the file, with its result.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)
        await dbConnect()

        const { id } = await context.params
        const upload = await loadUploadReport(id)

        return NextResponse.json({ success: true, data: serializeUploadReport(upload) })
    } catch (error) {
        return errorResponse(error, "Failed to load the upload")
    }
}
