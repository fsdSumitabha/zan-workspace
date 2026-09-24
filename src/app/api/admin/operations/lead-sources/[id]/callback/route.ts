import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import { errorResponse, readJson } from "@/lib/lead-sources/http"
import { setCallback } from "@/lib/lead-sources/mutations"

/**
 * PATCH /api/admin/operations/lead-sources/:id/callback
 *
 * Body: { callbackAt: ISO time, callbackDay: "YYYY-MM-DD", note? } to set,
 * or { callbackAt: null } to clear. Answers with the updated list row.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_ACCESS_ROLES)
        await dbConnect()

        const { id } = await context.params
        const row = await setCallback(id, user, await readJson(req))

        return NextResponse.json({ success: true, data: row })
    } catch (error) {
        return errorResponse(error, "Failed to set the callback")
    }
}
