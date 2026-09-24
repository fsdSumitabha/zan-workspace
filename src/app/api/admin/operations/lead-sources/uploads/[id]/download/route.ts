import { NextRequest } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_MANAGE_ROLES } from "@/constants/leadSourceRoles"
import { UPLOAD_ROW_RESULT, type UploadRowResult } from "@/constants/leadSourceStatus"
import { errorResponse } from "@/lib/lead-sources/http"
import { loadUploadReport } from "@/lib/lead-sources/uploadView"
import { attachmentHeader, buildReportWorkbook, XLSX_MIME } from "@/lib/lead-sources/sheet/workbook"

// "imported" includes rows imported with warnings, the same as the counts.
const ONLY: Record<string, UploadRowResult[]> = {
    imported: [UPLOAD_ROW_RESULT.IMPORTED, UPLOAD_ROW_RESULT.WARNED],
    warned: [UPLOAD_ROW_RESULT.WARNED],
    skipped: [UPLOAD_ROW_RESULT.SKIPPED],
}

/**
 * GET /api/admin/operations/lead-sources/uploads/:id/download?only=skipped
 *
 * The report as .xlsx. `only` limits it to one result, so the skipped rows
 * can be fixed in Excel and uploaded again.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)
        await dbConnect()

        const { id } = await context.params
        const upload = await loadUploadReport(id)

        const onlyKey = new URL(req.url).searchParams.get("only") ?? ""
        // hasOwn, so "constructor" and other inherited names are not read.
        const only = Object.hasOwn(ONLY, onlyKey) ? ONLY[onlyKey] : undefined

        const buffer = await buildReportWorkbook(
            {
                fileName: upload.fileName,
                uploadedBy: nameOf(upload.uploadedBy),
                uploadedAt: new Date(upload.createdAt),
                region: upload.region,
                assignedTo: upload.assignedTo ? nameOf(upload.assignedTo) : null,
                allottedDay: upload.allottedDay ?? null,
                columns: upload.columns ?? [],
                missingColumns: upload.missingColumns ?? [],
                fileNotes: upload.fileNotes ?? [],
                rows: upload.rows ?? [],
                counts: upload.counts ?? { read: 0, imported: 0, warned: 0, skipped: 0 },
            },
            only
        )

        const base = upload.fileName.replace(/\.(xlsx|csv)$/i, "")
        const suffix = only ? `-${onlyKey}` : ""

        return new Response(new Uint8Array(buffer), {
            headers: {
                "Content-Type": XLSX_MIME,
                "Content-Disposition": attachmentHeader(`${base}-report${suffix}.xlsx`),
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to build the report")
    }
}

function nameOf(value: unknown): string {
    if (value && typeof value === "object" && "name" in value) {
        return String((value as { name?: string }).name ?? "")
    }
    return ""
}
