import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import { errorResponse, readJson } from "@/lib/lead-sources/http"
import { changeStatus } from "@/lib/lead-sources/mutations"

/**
 * PATCH /api/admin/operations/lead-sources/:id/status
 *
 * Body: { status, note?, today, callbackAt?, callbackDay? }
 *
 * Call Back needs callbackAt and callbackDay. See the rules at the top of
 * src/lib/lead-sources/mutations.ts. Answers with the updated list row.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_ACCESS_ROLES)
        await dbConnect()

        const { id } = await context.params
        const row = await changeStatus(id, user, await readJson(req))

        return NextResponse.json({ success: true, data: row })
    } catch (error) {
        return errorResponse(error, "Failed to update the status")
    }
}
