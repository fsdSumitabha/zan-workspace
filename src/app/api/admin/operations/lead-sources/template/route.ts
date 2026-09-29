import { NextRequest } from "next/server"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_MANAGE_ROLES } from "@/constants/leadSourceRoles"
import { errorResponse } from "@/lib/lead-sources/http"
import { attachmentHeader, buildTemplateWorkbook, XLSX_MIME } from "@/lib/lead-sources/sheet/workbook"

/**
 * GET /api/admin/operations/lead-sources/template
 *
 * A blank .xlsx with the header row from src/config/leadSourceSheet.ts, and a
 * second sheet that explains each column.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)

        const buffer = await buildTemplateWorkbook()

        return new Response(new Uint8Array(buffer), {
            headers: {
                "Content-Type": XLSX_MIME,
                "Content-Disposition": attachmentHeader("lead-source-template.xlsx"),
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to build the template")
    }
}
