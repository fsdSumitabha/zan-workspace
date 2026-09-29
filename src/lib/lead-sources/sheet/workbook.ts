import writeXlsxFile, { type Cell, type Row, type SheetData } from "write-excel-file/node"
import { LEAD_SOURCE_COLUMNS, type ColumnKind } from "@/config/leadSourceSheet"
import {
    UPLOAD_ROW_RESULT,
    UPLOAD_ROW_RESULT_META,
    type UploadRowResult,
} from "@/constants/leadSourceStatus"

/**
 * Builds the .xlsx files people download: the upload report and the blank
 * template.
 *
 * Every value is written as a text cell. A cell that starts with "=" or "+"
 * is then shown as text by Excel, never run as a formula. That matters here,
 * because the values come from a file somebody else wrote.
 */

const HEADER_STYLE = {
    fontWeight: "bold",
    backgroundColor: "#E5E7EB",
    borderColor: "#9CA3AF",
    borderStyle: "thin",
} as const

function text(value: string, style: Partial<Exclude<Cell, null | undefined | string>> = {}): Cell {
    return { value, type: String, ...style } as Cell
}

function widthFor(values: string[], min = 8, max = 45): number {
    const longest = values.reduce((n, v) => Math.max(n, v.length), 0)
    return Math.min(max, Math.max(min, longest + 2))
}

export interface ReportInput {
    fileName: string
    uploadedBy: string
    uploadedAt: Date
    region: string
    assignedTo: string | null
    allottedDay: string | null
    columns: Array<{ header: string }>
    missingColumns: string[]
    fileNotes: string[]
    rows: Array<{ n: number; values: string[]; result: number; messages: string[] }>
    counts: { read: number; imported: number; warned: number; skipped: number }
}

/**
 * The upload report.
 *
 * The file's own columns come first, under the file's own header text, so a
 * person can fix the skipped rows in this file and upload it again. The
 * three report columns are ignored on the way back in. See
 * REPORT_ONLY_HEADERS in src/config/leadSourceSheet.ts.
 */
export async function buildReportWorkbook(
    input: ReportInput,
    only?: UploadRowResult[]
): Promise<Buffer> {
    const rows = only ? input.rows.filter((r) => only.includes(r.result as UploadRowResult)) : input.rows

    const header: Row = [
        text("Row no", HEADER_STYLE),
        ...input.columns.map((c) => text(c.header, HEADER_STYLE)),
        text("Upload result", HEADER_STYLE),
        text("Upload notes", HEADER_STYLE),
    ]

    const body: SheetData = rows.map((row) => {
        const meta = UPLOAD_ROW_RESULT_META[row.result as UploadRowResult]
        const fill = meta && row.result !== UPLOAD_ROW_RESULT.IMPORTED ? { backgroundColor: meta.excelFill } : {}

        return [
            { value: row.n, type: Number, ...fill } as Cell,
            ...input.columns.map((_, i) => text(row.values[i] ?? "", fill)),
            text(meta?.label ?? "", { ...fill, fontWeight: "bold" }),
            text(row.messages.join(" | "), fill),
        ]
    })

    const widths = [
        { width: 8 },
        ...input.columns.map((c, i) => ({
            width: widthFor([c.header, ...rows.slice(0, 500).map((r) => r.values[i] ?? "")]),
        })),
        { width: 24 },
        { width: 60 },
    ]

    const summary: SheetData = [
        [text("Upload report", { fontWeight: "bold" }), null],
        [text("File"), text(input.fileName)],
        [text("Uploaded by"), text(input.uploadedBy)],
        [text("Uploaded at (UTC)"), text(input.uploadedAt.toISOString().slice(0, 16).replace("T", " "))],
        [text("Region"), text(input.region)],
        [text("Assigned to"), text(input.assignedTo ?? "Nobody")],
        [text("Day"), text(input.allottedDay ?? "No day")],
        [null, null],
        [text("Rows read"), { value: input.counts.read, type: Number } as Cell],
        [text("Imported"), { value: input.counts.imported, type: Number } as Cell],
        [text("Imported with warnings"), { value: input.counts.warned, type: Number } as Cell],
        [text("Skipped"), { value: input.counts.skipped, type: Number } as Cell],
    ]

    if (input.missingColumns.length > 0) {
        summary.push([null, null])
        summary.push([text("Columns not in the file"), text(input.missingColumns.join(", "))])
    }

    for (const note of input.fileNotes) {
        summary.push([text("Note"), text(note)])
    }

    if (only) {
        summary.push([null, null])
        summary.push([
            text("This download"),
            text(`Only rows marked ${only.map((r) => `"${UPLOAD_ROW_RESULT_META[r].label}"`).join(" or ")}.`),
        ])
    }

    return writeXlsxFile([
        {
            sheet: "Report",
            data: [header, ...body],
            columns: widths,
            stickyRowsCount: 1,
        },
        {
            sheet: "Summary",
            data: summary,
            columns: [{ width: 26 }, { width: 70 }],
        },
    ]).toBuffer()
}

const KIND_NOTE: Record<ColumnKind, string> = {
    text: "Any text.",
    phone: "One phone number. Use +country code, or fill the country column.",
    email: "One email address.",
    date: "A date, such as 2026-01-15 or 15-Jan-2026.",
    country: "A country name or two-letter code, such as United States or US.",
}

/** The blank template, with a second sheet that explains each column. */
export async function buildTemplateWorkbook(): Promise<Buffer> {
    const header: Row = LEAD_SOURCE_COLUMNS.map((c) =>
        text(c.headers[0] ?? c.key, {
            ...HEADER_STYLE,
            ...(c.required ? { backgroundColor: "#FDE2E2" } : {}),
        })
    )

    const guide: SheetData = [
        [
            text("Header", HEADER_STYLE),
            text("Required", HEADER_STYLE),
            text("What goes in it", HEADER_STYLE),
            text("Other header names accepted", HEADER_STYLE),
        ],
        ...LEAD_SOURCE_COLUMNS.map((c) => [
            text(c.headers[0] ?? c.key, { fontWeight: "bold" }),
            text(c.required ? "Yes" : "No"),
            text(KIND_NOTE[c.kind]),
            text(c.headers.slice(1).join(", ")),
        ]),
        [null, null, null, null],
        [text("Header names are matched without case, spaces or underscores. \"Domain Name\" matches domain_name."), null, null, null],
        [text("Rows with an empty required cell, or a phone that is not valid, are skipped. The upload report lists every skipped row and why."), null, null, null],
    ]

    return writeXlsxFile([
        {
            sheet: "Lead sources",
            data: [header],
            columns: LEAD_SOURCE_COLUMNS.map((c) => ({ width: Math.max(14, (c.headers[0] ?? c.key).length + 4) })),
            stickyRowsCount: 1,
        },
        {
            sheet: "Columns",
            data: guide,
            columns: [{ width: 24 }, { width: 10 }, { width: 60 }, { width: 50 }],
            stickyRowsCount: 1,
        },
    ]).toBuffer()
}

/**
 * A Content-Disposition header for a download. The plain name is ASCII only,
 * and the full name goes in filename*, so a file named "Leads – Sept.xlsx"
 * neither breaks the header nor loses its dash.
 */
export function attachmentHeader(fileName: string): string {
    const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
