import {
    IMPORT_REPORT_ONLY_HEADERS,
    LEAD_IMPORT_COLUMNS,
    type ImportColumn,
    type ImportColumnKey,
} from "@/config/leadImportSheet"
import { AD_PLATFORM, type AdPlatform } from "@/constants/adTracking"
import { columnLetter, normalizeHeader } from "@/lib/lead-sources/sheet/headers"
import { wallTimeToUtc } from "@/lib/time/zone"

/**
 * Header matching and cell reading for the bulk lead import.
 *
 * Pure functions, no database. The rules are written in
 * src/config/leadImportSheet.ts, for whoever edits the column list.
 */

export interface ImportMatchedColumn {
    /** Position of the column in the sheet row. */
    index: number
    /** The header cell as written in the file. */
    header: string
    /** An ImportColumnKey, or the cleaned header of a question column. */
    key: string
    label: string
    /** false for a question column. */
    known: boolean
    config?: ImportColumn
}

export interface ImportHeaderMatch {
    /** Every column to read, in file order. */
    columns: ImportMatchedColumn[]
    /** Labels of required columns the row does not have. */
    missingRequired: string[]
    /** Keys that more than one header maps to, such as phone_number and work_phone_number. */
    shared: Array<{ label: string; headers: string[] }>
    /** Columns read as form questions. */
    questions: ImportMatchedColumn[]
    /** Columns with data but no header text, by letter. They are not read. */
    blankHeaders: string[]
}

const LOOKUP: Map<string, ImportColumn> = (() => {
    const map = new Map<string, ImportColumn>()
    for (const column of LEAD_IMPORT_COLUMNS) {
        for (const name of [column.key, ...column.headers]) {
            map.set(normalizeHeader(name), column)
        }
    }
    return map
})()

const REPORT_ONLY = new Set<string>(IMPORT_REPORT_ONLY_HEADERS)

export function matchImportHeaders(cells: string[], dataColumns?: Set<number>): ImportHeaderMatch {
    const columns: ImportMatchedColumn[] = []
    const byKey = new Map<string, ImportMatchedColumn[]>()
    const questionKeys = new Set<string>()
    const blankHeaders: string[] = []

    cells.forEach((raw, index) => {
        const header = (raw ?? "").trim()
        const normalized = normalizeHeader(header)

        if (!normalized) {
            if (dataColumns?.has(index)) blankHeaders.push(columnLetter(index))
            return
        }
        if (REPORT_ONLY.has(normalized)) return

        const config = LOOKUP.get(normalized)
        if (config) {
            const matched: ImportMatchedColumn = { index, header, key: config.key, label: config.label, known: true, config }
            columns.push(matched)
            byKey.set(config.key, [...(byKey.get(config.key) ?? []), matched])
            return
        }

        // A form question. Its key is the cleaned header, made unique and
        // never equal to a configured key.
        let key = normalized
        let suffix = 2
        while (questionKeys.has(key) || LOOKUP.has(key)) key = `${normalized}_${suffix++}`
        questionKeys.add(key)

        columns.push({ index, header, key, label: questionLabel(header), known: false })
    })

    const has = (key: ImportColumnKey) => byKey.has(key)
    const missingRequired: string[] = []
    // A name can also come from first_name and last_name.
    if (!has("name") && !has("firstName")) missingRequired.push("full_name")
    if (!has("phone")) missingRequired.push("phone_number")

    return {
        columns,
        missingRequired,
        shared: [...byKey.values()]
            .filter((list) => list.length > 1)
            .map((list) => ({ label: list[0].label, headers: list.map((c) => c.header) })),
        questions: columns.filter((c) => !c.known),
        blankHeaders,
    }
}

const HEADER_SEARCH_ROWS = 10

/**
 * The header row: the first of the top 10 non-empty rows that has a name
 * and a phone column. When none does, the row that matched the most known
 * columns, so the error can say what is missing.
 */
export function findImportHeaderRow(rows: string[][]): {
    index: number
    match: ImportHeaderMatch
    complete: boolean
} | null {
    let best: { index: number; match: ImportHeaderMatch; score: number } | null = null
    let checked = 0

    for (let i = 0; i < rows.length && checked < HEADER_SEARCH_ROWS; i++) {
        const row = rows[i]
        if (!row.some((cell) => cell.trim() !== "")) continue
        checked++

        const match = matchImportHeaders(row, columnsWithData(rows, i + 1))
        if (match.missingRequired.length === 0) return { index: i, match, complete: true }

        const score = match.columns.filter((c) => c.known).length
        if (!best || score > best.score) best = { index: i, match, score }
    }

    return best ? { index: best.index, match: best.match, complete: false } : null
}

function columnsWithData(rows: string[][], start: number): Set<number> {
    const set = new Set<number>()
    for (let r = start; r < rows.length; r++) {
        rows[r].forEach((cell, c) => {
            if (cell.trim() !== "") set.add(c)
        })
    }
    return set
}

// ---------------------------------------------------------------------------
// Cell readers
// ---------------------------------------------------------------------------

/**
 * Meta writes a short prefix before ids and phone numbers in its exports,
 * so Excel keeps them as text: "l:" lead, "ag:" ad, "as:" ad set,
 * "c:" campaign, "f:" form, "p:" phone.
 */
const META_PREFIX = /^(?:l|ag|as|c|f|p):/i

export function stripMetaPrefix(text: string): { value: string; hadPrefix: boolean } {
    const trimmed = text.trim()
    if (META_PREFIX.test(trimmed)) return { value: trimmed.replace(META_PREFIX, "").trim(), hadPrefix: true }
    return { value: trimmed, hadPrefix: false }
}

export type IdRead = { ok: true; id: string } | { ok: false; message: string }

/**
 * One platform id cell.
 *
 * Meta ids are 15 to 18 digits. Excel keeps only 15 digits of a number, so
 * an id that passed through Excel as a number is broken in one of two ways:
 *
 *   1.20212E+17          shown in scientific form
 *   120212345678901000   the last digits turned into zeros
 *
 * A broken id would join leads from different ads into one record, so it is
 * refused, with a warning. An id that still has Meta's prefix ("ag:...") was
 * text all along and is trusted.
 */
export function readPlatformId(text: string, platform: AdPlatform): IdRead {
    const { value, hadPrefix } = stripMetaPrefix(text)
    const compact = value.replace(/\s+/g, "")

    if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(compact)) {
        return { ok: false, message: `"${text}" was rounded by Excel and cannot be used.` }
    }

    if (platform === AD_PLATFORM.META) {
        if (!/^\d{1,25}$/.test(compact)) {
            return { ok: false, message: `"${text}" is not a Meta id.` }
        }
        if (!hadPrefix && compact.length >= 16 && compact.endsWith("000")) {
            return { ok: false, message: `"${text}" looks rounded by Excel (it ends in 000) and cannot be used.` }
        }
        return { ok: true, id: compact }
    }

    if (compact.length > 100) return { ok: false, message: "The id is longer than 100 characters." }
    return { ok: true, id: compact }
}

export function readBoolean(text: string): boolean | null {
    const value = text.trim().toLowerCase()
    if (["true", "yes", "y", "1"].includes(value)) return true
    if (["false", "no", "n", "0"].includes(value)) return false
    return null
}

const WITH_ZONE = /(?:z|[+-]\d{2}:?\d{2})$/i
const WALL = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * A date and time cell as an exact moment.
 *
 *   "2026-11-20T10:23:45+05:30"  exact, Meta's format
 *   "2026-11-20 10:23"           read as a clock time in `zone`
 *   "2026-11-20"                 midnight in `zone`
 *
 * Anything else returns null, and the row gets a warning.
 */
export function readDateTime(text: string, zone: string): Date | null {
    const value = text.trim()
    if (!value) return null

    if (WITH_ZONE.test(value)) {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? null : date
    }

    const m = WALL.exec(value)
    if (!m) return null
    const pad = (s: string | undefined) => String(Number(s ?? 0)).padStart(2, "0")
    return wallTimeToUtc(`${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5])}:${pad(m[6])}`, zone)
}

const EMAIL_ANYWHERE = /[^\s@,;:<>()[\]"']+@[^\s@,;:<>()[\]"']+\.[^\s@,;:<>()[\]"']+/g

/** The first email address in a cell, lower case, or null. */
export function readEmail(text: string): { email: string | null; several: boolean } {
    const found = (text.match(EMAIL_ANYWHERE) ?? []).map((e) => e.replace(/\.+$/, ""))
    return { email: found[0]?.toLowerCase() ?? null, several: found.length > 1 }
}

/**
 * "what_type_of_website_do_you_need?" as "What type of website do you need?".
 * A header that already has spaces only gets its first letter capitalised.
 */
export function questionLabel(header: string): string {
    const text = header.includes(" ") ? header.trim() : header.trim().replace(/_+/g, " ")
    const clean = text.replace(/\s+/g, " ").trim()
    return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/**
 * A multiple choice answer as a person reads it.
 *
 * Meta exports a picked option with underscores for spaces:
 * "within_1_month". A value with no spaces and an underscore is turned
 * into "Within 1 month". Any other answer is kept as written.
 */
export function answerText(value: string): string {
    const text = value.trim()
    if (text.includes(" ") || !text.includes("_") || /^https?:/i.test(text) || text.includes("@")) return text
    const spaced = text.replace(/_+/g, " ").trim()
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
