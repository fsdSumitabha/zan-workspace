import { NextRequest } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_IMPORT_ROLES } from "@/constants/adTrackingRoles"
import { LEAD_IMPORT_ROW_RESULT, type LeadImportRowResult } from "@/constants/adTracking"
import { errorResponse } from "@/lib/lead-sources/http"
import { attachmentHeader, XLSX_MIME } from "@/lib/lead-sources/sheet/workbook"
import { loadImportReport, serializeImportReport } from "@/lib/ad-tracking/importView"
import { buildImportReportWorkbook } from "@/lib/ad-tracking/workbook"

// "imported" includes rows imported with warnings, the same as the counts.
// "problems" is what a person fixes and imports again: failed rows only.
// Duplicates are left out of it, since importing them again changes nothing.
const ONLY: Record<string, LeadImportRowResult[]> = {
    imported: [LEAD_IMPORT_ROW_RESULT.IMPORTED, LEAD_IMPORT_ROW_RESULT.WARNED],
    duplicates: [LEAD_IMPORT_ROW_RESULT.DUPLICATE],
    failed: [LEAD_IMPORT_ROW_RESULT.FAILED],
}

/**
 * GET /api/admin/operations/ad-tracking/imports/:id/download?only=failed
 *
 * The report as .xlsx. `only=failed` gives the failed rows with the reason
 * on each, so they can be fixed in Excel and imported again as they are.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireRole(req, LEAD_IMPORT_ROLES)
        await dbConnect()

        const { id } = await context.params
        const report = serializeImportReport(await loadImportReport(id))

        const onlyKey = new URL(req.url).searchParams.get("only") ?? ""
        // hasOwn, so "constructor" and other inherited names are not read.
        const only = Object.hasOwn(ONLY, onlyKey) ? ONLY[onlyKey] : undefined

        const buffer = await buildImportReportWorkbook(report, only)
        const base = report.fileName.replace(/\.(xlsx|csv)$/i, "")

        return new Response(new Uint8Array(buffer), {
            headers: {
                "Content-Type": XLSX_MIME,
                "Content-Disposition": attachmentHeader(`${base}-import-report${only ? `-${onlyKey}` : ""}.xlsx`),
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to build the report")
    }
}
