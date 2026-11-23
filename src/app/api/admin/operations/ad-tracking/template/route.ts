import { NextRequest } from "next/server"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_IMPORT_ROLES } from "@/constants/adTrackingRoles"
import { errorResponse } from "@/lib/lead-sources/http"
import { attachmentHeader, XLSX_MIME } from "@/lib/lead-sources/sheet/workbook"
import { buildImportTemplateWorkbook } from "@/lib/ad-tracking/workbook"

/**
 * GET /api/admin/operations/ad-tracking/template
 *
 * A blank .xlsx with the import headers from src/config/leadImportSheet.ts,
 * and a second sheet that explains each column.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, LEAD_IMPORT_ROLES)

        const buffer = await buildImportTemplateWorkbook()

        return new Response(new Uint8Array(buffer), {
            headers: {
                "Content-Type": XLSX_MIME,
                "Content-Disposition": attachmentHeader("lead-import-template.xlsx"),
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to build the template")
    }
}
