import type { CountryCode } from "libphonenumber-js"
import {
    CHANNEL_SOURCE,
    LEAD_IMPORT_RULES,
    META_DEFAULT_SOURCE,
    type ImportColumnKey,
} from "@/config/leadImportSheet"
import {
    AD_PLATFORM,
    LEAD_IMPORT_ROW_RESULT,
    type AdPlatform,
    type LeadImportRowResult,
} from "@/constants/adTracking"
import { resolveCountryCode } from "@/lib/lead-sources/countries"
import { LeadSourceError } from "@/lib/lead-sources/http"
import { readPhone } from "@/lib/lead-sources/sheet/checkRows"
import {
    answerText,
    readBoolean,
    readDateTime,
    readEmail,
    readPlatformId,
    stripMetaPrefix,
    type ImportHeaderMatch,
} from "./sheet"

/**
 * Checks every data row under the header row, without the database.
 *
 * Here: empty and invalid cells, ids, dates, and the same lead twice in one
 * file. Against the database (already a lead) is in duplicates.ts, after
 * this.
 *
 * A row FAILS when it cannot become a lead: no name, or no valid phone.
 * Anything else that is wrong, such as a bad email or an id Excel rounded,
 * leaves the row importable with a warning, and that value is not used.
 */

/** One ad record named on a row: its platform id and the name the row gave it. */
export interface RowRef {
    id: string
    name: string
}

export interface CheckedLeadRow {
    /** Row number as Excel shows it. */
    n: number
    /** One value per matched column, exactly as in the file. */
    values: string[]
    result: LeadImportRowResult
    /** Warnings for an importable row, or the reasons a row failed or is a duplicate. */
    messages: string[]

    name: string
    /** E.164 when the row can be imported. */
    phone: string
    email: string
    /** Lead.source: facebook, instagram, or the source typed on the import page. */
    source: string
    externalLeadId: string | null
    submittedAt: Date | null
    /** true when the sheet says is_organic, or the row names no ad at all. */
    organic: boolean

    refs: { campaign?: RowRef; adSet?: RowRef; ad?: RowRef; form?: RowRef }

    /** Form questions and their answers, in file order. Empty answers are left out. */
    answers: Array<{ key: string; question: string; answer: string }>
    /** Columns marked inNote in leadImportSheet.ts, with a value. */
    details: Array<{ label: string; value: string }>

    /** Set by duplicates.ts when the lead already exists. */
    existing?: ExistingLead
    /** The existing lead had no ad, and this row's ad is (or would be) added to it. */
    linked?: boolean
}

export interface ExistingLead {
    _id: unknown
    region?: string
    deleted: boolean
    hasSource: boolean
    hasExternalId: boolean
}

export interface ImportCheckOptions {
    platform: AdPlatform
    /** Lead.source for every row of a non-Meta list. */
    source: string
    /** For a phone written without "+" on a row with no country. */
    fallbackCountry: CountryCode
    /** For a date and time written with no zone. */
    zone: string
}

export function checkImportRows(
    rows: string[][],
    headerIndex: number,
    match: ImportHeaderMatch,
    options: ImportCheckOptions
): CheckedLeadRow[] {
    const dataRows: Array<{ n: number; cells: string[] }> = []

    for (let i = headerIndex + 1; i < rows.length; i++) {
        const cells = match.columns.map((c) => rows[i][c.index] ?? "")
        if (cells.every((cell) => cell.trim() === "")) continue
        dataRows.push({ n: i + 1, cells })
    }

    if (dataRows.length === 0) {
        throw new LeadSourceError("The file has a header row but no rows of leads under it.", 400)
    }

    const { maxRows } = LEAD_IMPORT_RULES
    if (dataRows.length > maxRows) {
        throw new LeadSourceError(
            `This file has ${dataRows.length.toLocaleString("en-US")} rows. The limit is ` +
                `${maxRows.toLocaleString("en-US")}. Split it into smaller files and import each one.`,
            413
        )
    }

    const firstRowByPhone = new Map<string, number>()
    const firstRowByLeadId = new Map<string, number>()

    return dataRows.map(({ n, cells }) => {
        const row = checkOneRow(n, cells, match, options)
        if (row.result === LEAD_IMPORT_ROW_RESULT.FAILED) return row

        const sameLead = row.externalLeadId ? firstRowByLeadId.get(row.externalLeadId) : undefined
        if (sameLead !== undefined) {
            return duplicate(row, `Same lead id as row ${sameLead} of this file.`)
        }
        const samePhone = firstRowByPhone.get(row.phone)
        if (samePhone !== undefined) {
            return duplicate(row, `Same phone number as row ${samePhone} of this file.`)
        }

        if (row.externalLeadId) firstRowByLeadId.set(row.externalLeadId, n)
        firstRowByPhone.set(row.phone, n)
        return row
    })
}

function duplicate(row: CheckedLeadRow, reason: string): CheckedLeadRow {
    return { ...row, result: LEAD_IMPORT_ROW_RESULT.DUPLICATE, messages: [reason] }
}

const ID_KEYS: Array<{ id: ImportColumnKey; name: ImportColumnKey; ref: keyof CheckedLeadRow["refs"]; label: string }> = [
    { id: "campaignId", name: "campaignName", ref: "campaign", label: "campaign_id" },
    { id: "adSetId", name: "adSetName", ref: "adSet", label: "adset_id" },
    { id: "adId", name: "adName", ref: "ad", label: "ad_id" },
    { id: "formId", name: "formName", ref: "form", label: "form_id" },
]

function checkOneRow(n: number, cells: string[], match: ImportHeaderMatch, options: ImportCheckOptions): CheckedLeadRow {
    const warnings: string[] = []
    const problems: string[] = []

    // Known columns by key. When two headers share a key, such as
    // phone_number and work_phone_number, the first one with a value wins.
    const known = new Map<string, string>()
    const answers: CheckedLeadRow["answers"] = []
    const details: CheckedLeadRow["details"] = []
    const max = LEAD_IMPORT_RULES.maxCellLength

    match.columns.forEach((column, i) => {
        let text = cells[i].replace(/\s+/g, " ").trim()
        if (!text) return

        if (text.length > max) {
            text = text.slice(0, max)
            warnings.push(`${column.label} was longer than ${max} characters and was cut.`)
        }

        if (!column.known) {
            answers.push({ key: column.key, question: column.label, answer: answerText(text) })
            return
        }

        if (known.has(column.key)) return
        known.set(column.key, text)

        if (column.config?.inNote) details.push({ label: column.label, value: text })
    })

    const get = (key: ImportColumnKey) => known.get(key) ?? ""
    const isMeta = options.platform === AD_PLATFORM.META

    // The name. full_name, else first_name and last_name.
    const name = get("name") || [get("firstName"), get("lastName")].filter(Boolean).join(" ")
    if (!name) problems.push("Name is empty.")

    // The phone.
    let phone = ""
    const phoneText = stripMetaPrefix(get("phone")).value
    if (!phoneText) {
        problems.push("Phone is empty.")
    } else {
        const country = resolveCountryCode(get("country")) ?? options.fallbackCountry
        const check = readPhone(phoneText, country)
        if (check.ok) {
            phone = check.e164
            if (check.warning) warnings.push(check.warning)
        } else {
            problems.push(`Phone "${phoneText}": ${check.message}`)
        }
    }

    // The email. A bad one is left out; the lead is still imported.
    let email = ""
    const emailText = get("email")
    if (emailText) {
        const read = readEmail(emailText)
        if (!read.email) {
            warnings.push(`Email "${emailText}" is not a valid address. It was left out.`)
        } else {
            email = read.email
            if (read.several) warnings.push(`The email cell has more than one address. Used ${email}.`)
        }
    }

    // When the person sent the form.
    let submittedAt: Date | null = null
    const timeText = get("createdTime")
    if (timeText) {
        submittedAt = readDateTime(timeText, options.zone)
        if (!submittedAt) warnings.push(`Submitted at "${timeText}" is not a date and time. It was left out.`)
    }

    // The ad chain and the form. Only for a Meta list. A non-Meta list
    // could have an "id" or "campaign" column of its own, with nothing to
    // do with Meta, so those are ignored there.
    const refs: CheckedLeadRow["refs"] = {}
    let externalLeadId: string | null = null

    if (isMeta) {
        for (const level of ID_KEYS) {
            const idText = get(level.id)
            const nameText = get(level.name)
            if (!idText) {
                if (nameText) warnings.push(`${nameText} has no ${level.label}, so it is not linked.`)
                continue
            }
            const read = readPlatformId(idText, options.platform)
            if (read.ok) {
                refs[level.ref] = { id: read.id, name: nameText }
            } else {
                warnings.push(`${level.label} ${read.message}`)
            }
        }

        const leadIdText = get("leadId")
        if (leadIdText) {
            const read = readPlatformId(leadIdText, options.platform)
            if (read.ok) externalLeadId = read.id
            else warnings.push(`Lead id ${read.message}`)
        }
    }

    const organicCell = readBoolean(get("isOrganic"))
    const organic = organicCell ?? !(refs.ad || refs.adSet || refs.campaign)

    let source = options.source
    if (isMeta) {
        const channel = get("channel").toLowerCase()
        source = channel ? (CHANNEL_SOURCE[channel] ?? channel) : META_DEFAULT_SOURCE
    }

    const row: CheckedLeadRow = {
        n,
        values: cells,
        result: LEAD_IMPORT_ROW_RESULT.IMPORTED,
        messages: warnings,
        name,
        phone,
        email,
        source,
        externalLeadId,
        submittedAt,
        organic,
        refs,
        answers,
        details,
    }

    if (problems.length > 0) {
        return { ...row, result: LEAD_IMPORT_ROW_RESULT.FAILED, messages: problems }
    }
    return warnings.length > 0 ? { ...row, result: LEAD_IMPORT_ROW_RESULT.WARNED } : row
}
