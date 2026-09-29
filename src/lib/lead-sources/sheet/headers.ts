import {
    LEAD_SOURCE_COLUMNS,
    REPORT_ONLY_HEADERS,
    type SheetColumn,
} from "@/config/leadSourceSheet"

/**
 * Finds the header row of a sheet and matches its cells to the columns in
 * src/config/leadSourceSheet.ts. The rules are written there, for whoever
 * edits the column list. Safe to import on the client.
 */

/** "Domain Name", "domain-name" and "DOMAIN_NAME" all become "domain_name". */
export function normalizeHeader(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[\s._\-/\\]+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/^_+|_+$/g, "")
}

/** "A" for 0, "Z" for 25, "AA" for 26. */
export function columnLetter(index: number): string {
    let n = index + 1
    let out = ""
    while (n > 0) {
        const rem = (n - 1) % 26
        out = String.fromCharCode(65 + rem) + out
        n = Math.floor((n - 1) / 26)
    }
    return out
}

export interface MatchedColumn {
    /** Position of the column in the sheet row. */
    index: number
    /** The header cell as written in the file. */
    header: string
    key: string
    label: string
    known: boolean
    config?: SheetColumn
}

export interface HeaderMatch {
    /** Columns to read, in file order. Unknown ones included. */
    columns: MatchedColumn[]
    missingRequired: SheetColumn[]
    missingOptional: SheetColumn[]
    /** Two or more headers that mean the same column. */
    duplicates: Array<{ label: string; headers: string[] }>
    unknown: MatchedColumn[]
    /** Columns with data but no header text, by letter. They are not read. */
    blankHeaders: string[]
}

const LOOKUP: Map<string, SheetColumn> = (() => {
    const map = new Map<string, SheetColumn>()
    for (const column of LEAD_SOURCE_COLUMNS) {
        for (const name of [column.key, ...column.headers]) {
            map.set(normalizeHeader(name), column)
        }
    }
    return map
})()

const REPORT_ONLY = new Set<string>(REPORT_ONLY_HEADERS)

/** Matches one row of cells as if it were the header row. */
export function matchHeaderRow(cells: string[], dataColumns?: Set<number>): HeaderMatch {
    const columns: MatchedColumn[] = []
    const byKey = new Map<string, MatchedColumn[]>()
    const unknownKeys = new Set<string>()
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
            const matched: MatchedColumn = {
                index,
                header,
                key: config.key,
                label: config.label,
                known: true,
                config,
            }
            columns.push(matched)
            byKey.set(config.key, [...(byKey.get(config.key) ?? []), matched])
            return
        }

        // A header nobody configured. Its key is the cleaned header, made
        // unique, and never equal to a configured key.
        let key = normalized
        let suffix = 2
        while (unknownKeys.has(key) || LOOKUP.has(key)) {
            key = `${normalized}_${suffix++}`
        }
        unknownKeys.add(key)

        columns.push({ index, header, key, label: header, known: false })
    })

    const found = new Set(byKey.keys())

    return {
        columns,
        missingRequired: LEAD_SOURCE_COLUMNS.filter((c) => c.required && !found.has(c.key)),
        missingOptional: LEAD_SOURCE_COLUMNS.filter((c) => !c.required && !found.has(c.key)),
        duplicates: [...byKey.values()]
            .filter((list) => list.length > 1)
            .map((list) => ({ label: list[0].label, headers: list.map((c) => c.header) })),
        unknown: columns.filter((c) => !c.known),
        blankHeaders,
    }
}

/** How many rows from the top are searched for the header row. */
const HEADER_SEARCH_ROWS = 10

/**
 * Picks the header row: the first of the top non-empty rows that holds every
 * required column. When none does, returns the row that matched the most
 * columns, so the error can name what is missing from the closest attempt.
 */
export function findHeaderRow(rows: string[][]): {
    index: number
    match: HeaderMatch
    complete: boolean
} | null {
    let best: { index: number; match: HeaderMatch; score: number } | null = null
    let checked = 0

    for (let i = 0; i < rows.length && checked < HEADER_SEARCH_ROWS; i++) {
        const row = rows[i]
        if (!row.some((cell) => cell.trim() !== "")) continue
        checked++

        const dataColumns = columnsWithData(rows, i + 1)
        const match = matchHeaderRow(row, dataColumns)

        if (match.missingRequired.length === 0) {
            return { index: i, match, complete: true }
        }

        const score = match.columns.filter((c) => c.known).length
        if (!best || score > best.score) best = { index: i, match, score }
    }

    return best ? { index: best.index, match: best.match, complete: false } : null
}

/** Column positions that hold a value in any row from `start` on. */
function columnsWithData(rows: string[][], start: number): Set<number> {
    const set = new Set<number>()
    for (let r = start; r < rows.length; r++) {
        rows[r].forEach((cell, c) => {
            if (cell.trim() !== "") set.add(c)
        })
    }
    return set
}
