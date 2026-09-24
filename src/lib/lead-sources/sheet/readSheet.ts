// The "universal" entry, not "node". The node entry parses in a worker
// thread through `worker-f`, and its `node:worker_threads` import makes the
// production build fail in Turbopack's file tracing ("NftJsonAsset: cannot
// handle filepath node:worker_threads"). A file of at most 5,000 rows does
// not need a worker.
import readXlsxFile from "read-excel-file/universal"
import { decodeCsv, parseCsv } from "./csv"
import { LeadSourceError } from "../http"

/**
 * Reads an uploaded .xlsx or .csv file into sheets of text cells.
 *
 * Every cell comes back as text, trimmed. `rows[i]` is Excel row `i + 1`,
 * including empty rows in the middle, so a row number in the report is the
 * row the person sees in Excel.
 */

export interface SheetGrid {
    name: string
    rows: string[][]
}

export type SheetFileType = "xlsx" | "csv"

export function sheetFileType(fileName: string): SheetFileType {
    const ext = fileName.toLowerCase().split(".").pop() ?? ""

    if (ext === "xlsx") return "xlsx"
    if (ext === "csv") return "csv"

    if (ext === "xls") {
        throw new LeadSourceError(
            "This is an old .xls file. Open it in Excel, save it as .xlsx, and upload that.",
            415
        )
    }

    throw new LeadSourceError("Upload an .xlsx or a .csv file.", 415)
}

export async function readSheetFile(
    data: ArrayBuffer,
    type: SheetFileType
): Promise<SheetGrid[]> {
    if (type === "csv") {
        return [{ name: "CSV", rows: parseCsv(decodeCsv(new Uint8Array(data))).map(padRow) }]
    }

    let sheets: Awaited<ReturnType<typeof readXlsxFile<string>>>

    try {
        // parseNumber keeps numbers as the text Excel stored. A phone number
        // typed without "+" is a number cell, and reading it as a JS number
        // would print a long one as 1.4155550123e10.
        sheets = await readXlsxFile<string>(data, {
            parseNumber: (text: string) => text,
            trim: true,
        })
    } catch (error) {
        console.error("[lead-sources] could not read xlsx:", error)
        throw new LeadSourceError(
            "This file could not be read as an Excel file. Open it in Excel, save it as .xlsx again, and upload that.",
            400
        )
    }

    return sheets.map((sheet) => ({
        name: sheet.sheet,
        rows: (sheet.data as unknown[][]).map((row) => padRow(row.map(cellToText))),
    }))
}

function padRow(row: string[]): string[] {
    return row.map((cell) => (typeof cell === "string" ? cell.trim() : ""))
}

/**
 * One cell as text.
 *
 * A date cell comes back as a Date in UTC. Midnight is written as the day
 * only, since that is what a date column holds. Anything with a time keeps
 * the time.
 */
export function cellToText(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return ""
        const iso = value.toISOString()
        return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ")
    }

    return String(value)
}
