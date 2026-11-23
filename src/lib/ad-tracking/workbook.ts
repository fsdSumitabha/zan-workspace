import writeXlsxFile, { type Cell, type Row, type SheetData } from "write-excel-file/node"
import { LEAD_IMPORT_COLUMNS, type ImportColumnKind } from "@/config/leadImportSheet"
import {
    AD_PLATFORM_META,
    LEAD_IMPORT_ROW_RESULT,
    LEAD_IMPORT_ROW_RESULT_META,
    type AdPlatform,
    type LeadImportRowResult,
} from "@/constants/adTracking"
import type { LeadImportReport } from "@/types/adTracking"

/**
 * The .xlsx files of the lead import: the report and the blank template.
 *
 * Same rules as src/lib/lead-sources/sheet/workbook.ts. Every value is a
 * text cell, so a value that starts with "=" is shown, never run. The file's
 * own columns come first, under the file's own headers, so the failed rows
 * can be fixed in Excel and imported again as they are. The three report
 * columns are ignored on the way back in (IMPORT_REPORT_ONLY_HEADERS).
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

function num(value: number): Cell {
    return { value, type: Number } as Cell
}

function widthFor(values: string[], min = 8, max = 45): number {
    const longest = values.reduce((n, v) => Math.max(n, v.length), 0)
    return Math.min(max, Math.max(min, longest + 2))
}

export async function buildImportReportWorkbook(report: LeadImportReport, only?: LeadImportRowResult[]): Promise<Buffer> {
    const rows = only ? report.rows.filter((r) => only.includes(r.result as LeadImportRowResult)) : report.rows

    const header: Row = [
        text("Row no", HEADER_STYLE),
        ...report.columns.map((c) => text(c.header, HEADER_STYLE)),
        text("Import result", HEADER_STYLE),
        text("Import notes", HEADER_STYLE),
    ]

    const body: SheetData = rows.map((row) => {
        const meta = LEAD_IMPORT_ROW_RESULT_META[row.result as LeadImportRowResult]
        const fill = meta && row.result !== LEAD_IMPORT_ROW_RESULT.IMPORTED ? { backgroundColor: meta.excelFill } : {}
        return [
            { value: row.n, type: Number, ...fill } as Cell,
            ...report.columns.map((_, i) => text(row.values[i] ?? "", fill)),
            text(meta?.label ?? "", { ...fill, fontWeight: "bold" }),
            text(row.messages.join(" | "), fill),
        ]
    })

    const widths = [
        { width: 8 },
        ...report.columns.map((c, i) => ({ width: widthFor([c.header, ...rows.slice(0, 300).map((r) => r.values[i] ?? "")]) })),
        { width: 24 },
        { width: 60 },
    ]

    const platform = AD_PLATFORM_META[report.platform as AdPlatform]?.short ?? report.platform
    const summary: SheetData = [
        [text("Lead import report", { fontWeight: "bold" }), null],
        [text("File"), text(report.fileName)],
        [text("Imported by"), text(report.uploadedBy?.name ?? "")],
        [text("Imported at (UTC)"), text(report.createdAt.slice(0, 16).replace("T", " "))],
        [text("Region"), text(report.region)],
        [text("Platform"), text(platform)],
        [null, null],
        [text("Rows read"), num(report.counts.read)],
        [text("Imported"), num(report.counts.imported)],
        [text("Imported with warnings"), num(report.counts.warned)],
        [text("Duplicates"), num(report.counts.duplicates)],
        [text("Failed"), num(report.counts.failed)],
        [null, null],
        [text("New campaigns"), num(report.newSources.campaigns)],
        [text("New ad sets"), num(report.newSources.adSets)],
        [text("New ads"), num(report.newSources.ads)],
        [text("New lead forms"), num(report.newSources.forms)],
    ]

    for (const note of report.fileNotes) summary.push([text("Note"), text(note)])

    if (only) {
        summary.push([null, null])
        summary.push([
            text("This download"),
            text(`Only rows marked ${only.map((r) => `"${LEAD_IMPORT_ROW_RESULT_META[r].label}"`).join(" or ")}.`),
        ])
    }

    const byCampaign: SheetData = [
        [
            text("Campaign", HEADER_STYLE),
            text("Campaign id", HEADER_STYLE),
            text("Imported", HEADER_STYLE),
            text("Duplicates", HEADER_STYLE),
            text("Failed", HEADER_STYLE),
        ],
        ...report.breakdown.campaigns.map((c) => [text(c.name), text(c.externalId), num(c.imported), num(c.duplicates), num(c.failed)]),
    ]

    return writeXlsxFile([
        { sheet: "Report", data: [header, ...body], columns: widths, stickyRowsCount: 1 },
        { sheet: "Summary", data: summary, columns: [{ width: 26 }, { width: 70 }] },
        {
            sheet: "By campaign",
            data: byCampaign,
            columns: [{ width: 40 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 10 }],
            stickyRowsCount: 1,
        },
    ]).toBuffer()
}

const KIND_NOTE: Record<ImportColumnKind, string> = {
    text: "Any text.",
    phone: "One phone number. Use +country code, or fill the country column.",
    email: "One email address.",
    id: "The platform id, as Meta exports it (\"c:120212...\" is fine). Keep it as text: Excel rounds long numbers.",
    datetime: "A date and time, such as 2026-11-20T10:23:45+05:30.",
    boolean: "true or false.",
    country: "A country name or two-letter code.",
}

/**
 * The blank template, in Meta's column order, with a second sheet that
 * explains each column. Meant for lists that do not come from a Meta
 * export. A Meta export can be imported as it is.
 */
export async function buildImportTemplateWorkbook(): Promise<Buffer> {
    const order = [
        "name", "phone", "email", "company", "website", "createdTime",
        "campaignId", "campaignName", "adSetId", "adSetName", "adId", "adName",
        "formId", "formName", "channel", "isOrganic", "leadId",
    ]
    const columns = order
        .map((key) => LEAD_IMPORT_COLUMNS.find((c) => c.key === key))
        .filter((c): c is (typeof LEAD_IMPORT_COLUMNS)[number] => !!c)

    const header: Row = [
        ...columns.map((c) =>
            text(c.headers[0] ?? c.key, { ...HEADER_STYLE, ...(c.required ? { backgroundColor: "#FDE2E2" } : {}) })
        ),
        text("what_type_of_website_do_you_need?", { ...HEADER_STYLE, backgroundColor: "#E0F0FB" }),
    ]

    const guide: SheetData = [
        [text("Header", HEADER_STYLE), text("Required", HEADER_STYLE), text("What goes in it", HEADER_STYLE), text("Other header names accepted", HEADER_STYLE)],
        ...LEAD_IMPORT_COLUMNS.map((c) => [
            text(c.headers[0] ?? c.key, { fontWeight: "bold" }),
            text(c.required ? "Yes" : "No"),
            text(KIND_NOTE[c.kind] + (c.inNote ? " Written into the lead's first note." : "")),
            text(c.headers.slice(1).join(", ")),
        ]),
        [null, null, null, null],
        [text("Any other header is read as a form question, like the blue one. Its answer goes into the lead's first note."), null, null, null],
        [text("full_name can be replaced by first_name and last_name. phone_number can be work_phone_number."), null, null, null],
        [text("Rows with no name, or no valid phone, fail. Leads already in the CRM are duplicates. The import report lists every row and why."), null, null, null],
    ]

    return writeXlsxFile([
        {
            sheet: "Leads",
            data: [header],
            columns: [...columns.map((c) => ({ width: Math.max(14, (c.headers[0] ?? c.key).length + 4) })), { width: 36 }],
            stickyRowsCount: 1,
        },
        {
            sheet: "Columns",
            data: guide,
            columns: [{ width: 24 }, { width: 10 }, { width: 70 }, { width: 50 }],
            stickyRowsCount: 1,
        },
    ]).toBuffer()
}
