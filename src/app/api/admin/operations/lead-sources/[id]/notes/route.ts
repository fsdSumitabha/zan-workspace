import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import { errorResponse, readJson } from "@/lib/lead-sources/http"
import { addNote } from "@/lib/lead-sources/mutations"

/**
 * POST /api/admin/operations/lead-sources/:id/notes
 *
 * Body: { text }. The newest note is the dimmed line under the name on the
 * list. Answers with the updated list row.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_ACCESS_ROLES)
        await dbConnect()

        const { id } = await context.params
        const row = await addNote(id, user, await readJson(req))

        return NextResponse.json({ success: true, data: row }, { status: 201 })
    } catch (error) {
        return errorResponse(error, "Failed to add the note")
    }
}
