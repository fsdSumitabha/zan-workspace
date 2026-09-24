import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"
import { LEAD_SOURCE_SHEET_RULES } from "@/config/leadSourceSheet"
import { UPLOAD_ROW_RESULT, type UploadRowResult } from "@/constants/leadSourceStatus"
import { validatePhone } from "@/lib/phone"
import { resolveCountryCode } from "../countries"
import { readDate } from "./dates"
import { LeadSourceError } from "../http"
import type { HeaderMatch } from "./headers"

/**
 * Checks every data row under the header row.
 *
 * Only checks that need the file itself happen here: empty required cells,
 * phone and email shape, dates, and the same phone twice in one file. Checks
 * against the database (already uploaded, already a lead) happen in
 * upload.ts, after this.
 */

export interface CheckedRow {
    /** Row number as Excel shows it. */
    n: number
    /** One value per matched column, exactly as in the file. */
    values: string[]
    /** Cleaned values by column key. Saved on the lead source. */
    data: Record<string, string>
    name: string
    company: string
    email: string
    /** E.164 when the row can be imported. */
    phone: string
    result: UploadRowResult
    /** Warnings for an imported row, or the reasons a row was skipped. */
    messages: string[]
}

export interface CheckOptions {
    /** Used for a phone without a "+" code when the row has no country. */
    fallbackCountry: CountryCode
    /** How to read "03/04/2021". US sheets are month first. */
    dateOrder: "DMY" | "MDY"
}

export function checkRows(
    rows: string[][],
    headerIndex: number,
    match: HeaderMatch,
    options: CheckOptions
): CheckedRow[] {
    const dataRows: Array<{ n: number; cells: string[] }> = []

    for (let i = headerIndex + 1; i < rows.length; i++) {
        const cells = match.columns.map((c) => rows[i][c.index] ?? "")
        if (cells.every((cell) => cell.trim() === "")) continue
        dataRows.push({ n: i + 1, cells })
    }

    if (dataRows.length === 0) {
        throw new LeadSourceError("The file has a header row but no data rows under it.", 400)
    }

    const { maxRows } = LEAD_SOURCE_SHEET_RULES
    if (dataRows.length > maxRows) {
        throw new LeadSourceError(
            `This file has ${dataRows.length.toLocaleString("en-US")} rows. ` +
                `The limit is ${maxRows.toLocaleString("en-US")}. ` +
                "Split it into smaller files and upload each one.",
            413
        )
    }

    const firstRowByPhone = new Map<string, number>()

    return dataRows.map(({ n, cells }) => {
        const row = checkOneRow(n, cells, match, options)

        if (row.result !== UPLOAD_ROW_RESULT.SKIPPED) {
            const first = firstRowByPhone.get(row.phone)
            if (first !== undefined) {
                return skip(row, `Same phone number as row ${first} of this file.`)
            }
            firstRowByPhone.set(row.phone, n)
        }

        return row
    })
}

function skip(row: CheckedRow, reason: string): CheckedRow {
    return { ...row, result: UPLOAD_ROW_RESULT.SKIPPED, messages: [reason] }
}

function checkOneRow(
    n: number,
    cells: string[],
    match: HeaderMatch,
    options: CheckOptions
): CheckedRow {
    const warnings: string[] = []
    const problems: string[] = []
    const data: Record<string, string> = {}

    match.columns.forEach((column, i) => {
        let text = cells[i].replace(/\s+/g, " ").trim()

        const max = LEAD_SOURCE_SHEET_RULES.maxCellLength
        if (text.length > max) {
            text = text.slice(0, max)
            warnings.push(`${column.label} was longer than ${max} characters and was cut.`)
        }

        if (!text) {
            if (column.config?.required) problems.push(`${column.label} is empty.`)
            return
        }

        if (column.config?.kind === "date") {
            const day = readDate(text, options.dateOrder)
            if (day) {
                data[column.key] = day
            } else {
                data[column.key] = text
                warnings.push(`${column.label} "${text}" is not a date. Kept as text.`)
            }
            return
        }

        data[column.key] = text
    })

    const country = resolveCountryCode(data.country) ?? options.fallbackCountry

    // Every phone column is checked. Only "phone" decides whether the row is
    // imported, because that is the number the call button uses.
    let phone = ""
    for (const column of match.columns) {
        if (column.config?.kind !== "phone") continue
        const text = data[column.key]
        if (!text) continue

        const check = readPhone(text, country)

        if (column.key === "phone") {
            if (check.ok) {
                phone = check.e164
                if (check.warning) warnings.push(check.warning)
            } else {
                problems.push(`Phone "${text}": ${check.message}`)
            }
        } else if (!check.ok) {
            warnings.push(`${column.label} "${text}": ${check.message}`)
        }
    }

    let email = ""
    const emailText = data.email ?? ""
    if (emailText) {
        const found = (emailText.match(EMAIL_ANYWHERE) ?? []).map((e) => e.replace(/\.+$/, ""))
        if (found.length === 0) {
            warnings.push(`Email "${emailText}" is not a valid address. It is kept in the sheet data only.`)
        } else {
            email = found[0].toLowerCase()
            if (found.length > 1) warnings.push(`The email cell has more than one address. Used ${email}.`)
        }
    }

    // "name" is required in the config today. If a developer makes it
    // optional, a row still needs something to show as its name.
    let name = data.name ?? ""
    if (!name) {
        name = data.company || data.domain_name || phone
        if (name) warnings.push("The name is empty. Showing the company or domain instead.")
    }

    const row: CheckedRow = {
        n,
        values: cells,
        data,
        name,
        company: data.company ?? "",
        email,
        phone,
        result: UPLOAD_ROW_RESULT.IMPORTED,
        messages: warnings,
    }

    if (!phone && !problems.some((p) => p.startsWith("Phone"))) {
        problems.push("Phone is empty.")
    }

    if (problems.length > 0) {
        return { ...row, result: UPLOAD_ROW_RESULT.SKIPPED, messages: problems }
    }

    return warnings.length > 0 ? { ...row, result: UPLOAD_ROW_RESULT.WARNED } : row
}

const EMAIL_ANYWHERE = /[^\s@,;:<>()[\]"']+@[^\s@,;:<>()[\]"']+\.[^\s@,;:<>()[\]"']+/g

type PhoneRead =
    | { ok: true; e164: string; warning?: string }
    | { ok: false; message: string }

/**
 * One phone cell as E.164.
 *
 * Stricter than a person typing into a form would need, but kinder in two
 * cases that bought lists are full of:
 *
 *   - An extension, "415 555 0123 ext 5". The main number is kept, and the
 *     full text stays in the sheet data.
 *   - Two numbers in one cell, "415 555 0123 / 415 555 0124". The first
 *     valid one is used.
 */
export function readPhone(text: string, country: CountryCode): PhoneRead {
    const check = validatePhone(text, country)
    if (check.ok) return { ok: true, e164: check.e164 }

    if (check.code === "HAS_EXTENSION") {
        const parsed = parsePhoneNumberFromString(text.trim().replace(/^00/, "+"), {
            defaultCountry: country,
            extract: false,
        })
        if (parsed?.isValid()) {
            return {
                ok: true,
                e164: parsed.number,
                warning: `The phone has an extension (${parsed.ext}). Saved the main number only.`,
            }
        }
    }

    const parts = text
        .split(/\s*(?:[/,;|&]|\bor\b)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean)

    if (parts.length > 1) {
        for (const part of parts) {
            const partCheck = validatePhone(part, country)
            if (partCheck.ok) {
                return {
                    ok: true,
                    e164: partCheck.e164,
                    warning: `The phone cell has more than one number. Used ${partCheck.e164}.`,
                }
            }
        }
    }

    return { ok: false, message: check.message }
}
