import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_CONVERT_ROLES } from "@/constants/leadSourceRoles"
import { convertLeadSource } from "@/lib/lead-sources/convert"
import { errorResponse } from "@/lib/lead-sources/http"

/**
 * POST /api/admin/operations/lead-sources/:id/convert
 *
 * Creates a Lead from the source. Answers with the new lead's id.
 * See src/lib/lead-sources/convert.ts.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_CONVERT_ROLES)
        await dbConnect()

        const { id } = await context.params
        const result = await convertLeadSource(id, user)

        return NextResponse.json({ success: true, data: result }, { status: 201 })
    } catch (error) {
        return errorResponse(error, "Failed to convert the lead source")
    }
}
