import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_MANAGE_ROLES } from "@/constants/leadSourceRoles"
import { LEAD_SOURCE_COLUMNS, LEAD_SOURCE_SHEET_RULES } from "@/config/leadSourceSheet"
import { errorResponse } from "@/lib/lead-sources/http"

/**
 * GET /api/admin/operations/lead-sources/columns
 *
 * The sheet columns and the upload limits from src/config/leadSourceSheet.ts.
 * The phone app's upload screen shows the expected header row from it,
 * because the app cannot import that file. The web upload page imports the
 * file directly and does not call this route.
 *
 * Only the fields the upload screen needs. `kind`, `inList` and `searchable`
 * stay on the server.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)

        const columns = LEAD_SOURCE_COLUMNS.map((column) => ({
            key: column.key,
            label: column.label,
            headers: [...column.headers],
            required: Boolean(column.required),
        }))

        return NextResponse.json({
            success: true,
            data: {
                columns,
                rules: {
                    maxFileMb: LEAD_SOURCE_SHEET_RULES.maxFileMb,
                    maxRows: LEAD_SOURCE_SHEET_RULES.maxRows,
                },
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the sheet columns")
    }
}
