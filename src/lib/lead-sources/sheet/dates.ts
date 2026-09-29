import { isDayString } from "../day"

/**
 * Dates in uploaded sheets. Kept apart from checkRows.ts so it can be
 * tested on its own. See src/scripts/test-lead-source-sheet.ts.
 */

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function monthNumber(word: string): number | null {
    const key = word.toLowerCase()
    return MONTHS[key] ?? MONTHS[key.slice(0, 3)] ?? null
}

function fullYear(text: string): number {
    const y = Number(text)
    if (text.length > 2) return y
    return y < 70 ? 2000 + y : 1900 + y
}

function toDay(y: number, m: number, d: number): string | null {
    const day = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    return isDayString(day) ? day : null
}

/**
 * Reads the date formats seen in domain and contact lists, and returns
 * "YYYY-MM-DD", or null when the text is not a date.
 *
 *   2020-01-15, 2020-01-15T10:00:00Z, 2020/01/15
 *   15-Jan-2021, 15 January 2021, Jan 15, 2021
 *   03/04/2021, where the order follows `order` unless one part is over 12
 *   43845, an Excel day number that lost its date format in a CSV export
 */
export function readDate(text: string, order: "DMY" | "MDY"): string | null {
    const t = text.trim()

    let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
    if (m) return toDay(Number(m[1]), Number(m[2]), Number(m[3]))

    m = t.match(/^(\d{1,2})[-\s/.]+([A-Za-z]{3,9})[-\s/.,]+(\d{2,4})$/)
    if (m) {
        const month = monthNumber(m[2])
        if (month) return toDay(fullYear(m[3]), month, Number(m[1]))
    }

    m = t.match(/^([A-Za-z]{3,9})[-\s.]+(\d{1,2})(?:st|nd|rd|th)?,?[-\s.]+(\d{2,4})$/)
    if (m) {
        const month = monthNumber(m[1])
        if (month) return toDay(fullYear(m[3]), month, Number(m[2]))
    }

    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/)
    if (m) {
        const a = Number(m[1])
        const b = Number(m[2])
        const y = fullYear(m[3])
        if (a > 12) return toDay(y, b, a)
        if (b > 12) return toDay(y, a, b)
        return order === "DMY" ? toDay(y, b, a) : toDay(y, a, b)
    }

    if (/^\d{5}(\.\d+)?$/.test(t)) {
        const serial = Math.floor(Number(t))
        // Excel counts days from 1899-12-30. Below 61 its calendar has a
        // made-up 29 Feb 1900, and nobody's domain was created then.
        if (serial > 60 && serial < 2958466) {
            const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
            return date.toISOString().slice(0, 10)
        }
    }

    return null
}
