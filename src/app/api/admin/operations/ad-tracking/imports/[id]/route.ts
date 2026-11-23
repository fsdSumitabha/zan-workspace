import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_IMPORT_ROLES } from "@/constants/adTrackingRoles"
import { errorResponse } from "@/lib/lead-sources/http"
import { loadImportReport, serializeImportReport } from "@/lib/ad-tracking/importView"

/**
 * GET /api/admin/operations/ad-tracking/imports/:id
 *
 * One import and its full report: every row of the file with its result,
 * and the lead counts by campaign, ad set, ad and form.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireRole(req, LEAD_IMPORT_ROLES)
        await dbConnect()

        const { id } = await context.params
        const doc = await loadImportReport(id)

        return NextResponse.json({ success: true, data: serializeImportReport(doc) })
    } catch (error) {
        return errorResponse(error, "Failed to load the import")
    }
}
