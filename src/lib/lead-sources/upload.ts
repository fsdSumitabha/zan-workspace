import { Types } from "mongoose"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { REGIONS, type RegionCode } from "@/lib/region"
import { LEAD_SOURCE_SHEET_RULES } from "@/config/leadSourceSheet"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import {
    LEAD_SOURCE_ACTIVITY,
    LEAD_SOURCE_STATUS,
    LEAD_SOURCE_STATUS_META,
    UPLOAD_ROW_RESULT,
    UPLOAD_STATUS,
    type LeadSourceStatus,
} from "@/constants/leadSourceStatus"
import { auditedCreate } from "@/lib/activity-log"
import Lead from "@/models/Lead"
import LeadSource from "@/models/LeadSource"
import LeadSourceUpload from "@/models/LeadSourceUpload"
import { activityEntry } from "./activity"
import type { ResolvedAssignee } from "./assignee"
import { LeadSourceError } from "./http"
import { checkRows, type CheckedRow } from "./sheet/checkRows"
import { findHeaderRow, type HeaderMatch } from "./sheet/headers"
import { readSheetFile, sheetFileType, type SheetGrid } from "./sheet/readSheet"

/**
 * One sheet upload, from the file to the saved report.
 *
 *   1. Read the file. Refuse it if it is not a readable .xlsx or .csv.
 *   2. Find the header row. Refuse the file if a required column is missing,
 *      if two headers mean the same column, or if an unknown header is found
 *      and leadSourceSheet.ts says not to keep them.
 *   3. Check every row. See sheet/checkRows.ts.
 *   4. Skip rows whose phone is already a lead source in this region, or
 *      already a lead anywhere.
 *   5. Save the good rows as lead sources, and every row in the report.
 *
 * A file-level problem refuses the whole file and saves nothing. A row-level
 * problem skips that row only, and the report says why.
 */

export interface UploadInput {
    file: File
    region: RegionCode
    assignee: ResolvedAssignee | null
    allottedDay: string | null
    user: AuthUser
}

export interface UploadResult {
    uploadId: string
    counts: { read: number; imported: number; warned: number; skipped: number }
}

const INSERT_CHUNK = 1000

/** Longest cell kept in the report copy. */
const REPORT_CELL_MAX = 500

/**
 * The report is one MongoDB document, and a document is capped at 16 MB.
 * Refuse the file well before that, with a message a person can act on,
 * instead of failing on save.
 *
 * Counted in UTF-8 bytes, the way MongoDB stores text. A character count is
 * wrong for Hindi or Arabic text, where one character takes three bytes.
 * The 8 per value covers the array index and type bytes around each string.
 */
const REPORT_MAX_BYTES = 10_000_000

function refuseOversizedReport(rows: Array<{ values: string[]; messages: string[] }>): void {
    let total = 0
    for (const row of rows) {
        for (const v of row.values) total += Buffer.byteLength(v, "utf8") + 8
        for (const m of row.messages) total += Buffer.byteLength(m, "utf8") + 8
    }
    if (total > REPORT_MAX_BYTES) {
        throw new LeadSourceError(
            "This file holds too much text for one upload. Split it into smaller files.",
            413
        )
    }
}

export async function processUpload(input: UploadInput): Promise<UploadResult> {
    const { file, region, assignee, allottedDay, user } = input

    const type = sheetFileType(file.name)

    const maxBytes = LEAD_SOURCE_SHEET_RULES.maxFileMb * 1024 * 1024
    if (file.size > maxBytes) {
        throw new LeadSourceError(
            `The file is larger than ${LEAD_SOURCE_SHEET_RULES.maxFileMb} MB. Split it into smaller files.`,
            413
        )
    }
    if (file.size === 0) throw new LeadSourceError("The file is empty.", 400)

    const sheets = await readSheetFile(await file.arrayBuffer(), type)
    const { sheet, headerIndex, match } = pickSheet(sheets)

    const fileNotes = describeFile(sheets, sheet, headerIndex, match)

    const checked = checkRows(sheet.rows, headerIndex, match, {
        fallbackCountry: REGIONS[region].phoneCountry,
        dateOrder: region === "US" ? "MDY" : "DMY",
    })

    await skipKnownPhones(checked, region)

    const reportRows = checked.map((row) => ({
        n: row.n,
        values: row.values.map((v) => (v.length > REPORT_CELL_MAX ? `${v.slice(0, REPORT_CELL_MAX)}…` : v)),
        result: row.result,
        messages: row.messages,
    }))
    refuseOversizedReport(reportRows)

    const upload = await auditedCreate(
        LeadSourceUpload,
        ENTITY_TYPE.LEAD_SOURCE_UPLOAD,
        {
            region,
            fileName: file.name.slice(0, 200),
            fileSize: file.size,
            sheetName: sheet.name,
            headerRow: headerIndex + 1,
            uploadedBy: new Types.ObjectId(user.id),
            assignedTo: assignee?._id ?? null,
            allottedDay,
            status: UPLOAD_STATUS.PROCESSING,
        },
        user.id
    )

    const now = new Date()
    const sourceIds = new Map<number, Types.ObjectId>()

    const docs = checked
        .filter((row) => row.result !== UPLOAD_ROW_RESULT.SKIPPED)
        .map((row) => {
            const _id = new Types.ObjectId()
            sourceIds.set(row.n, _id)

            return {
                _id,
                region,
                uploadId: upload._id,
                rowNumber: row.n,
                name: row.name,
                company: row.company || undefined,
                email: row.email || undefined,
                phone: row.phone,
                data: row.data,
                importNotes: row.messages,
                status: LEAD_SOURCE_STATUS.NEW,
                assignedTo: assignee?._id ?? null,
                allottedDay,
                lastActivityAt: now,
                activity: [
                    activityEntry(
                        user,
                        LEAD_SOURCE_ACTIVITY.UPLOADED,
                        {
                            text: `${file.name}, row ${row.n}`,
                            to: { assignee: assignee?.name ?? null, day: allottedDay },
                        },
                        now
                    ),
                ],
                createdBy: new Types.ObjectId(user.id),
            }
        })

    const counts = {
        read: checked.length,
        imported: checked.filter((r) => r.result !== UPLOAD_ROW_RESULT.SKIPPED).length,
        warned: checked.filter((r) => r.result === UPLOAD_ROW_RESULT.WARNED).length,
        skipped: checked.filter((r) => r.result === UPLOAD_ROW_RESULT.SKIPPED).length,
    }

    // Saving the rows and saving the report succeed together or not at all.
    // If either fails, the rows already saved are removed and the upload is
    // marked failed, so no lead sources exist without a report.
    try {
        // insertMany skips the save hooks, so no activity log row is written
        // per source. The upload's own row covers the whole file. It does
        // run validation, so regionScopePlugin still checks every region.
        for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
            await LeadSource.insertMany(docs.slice(i, i + INSERT_CHUNK), { ordered: true })
        }

        // A plain update, not an audited one. The audited helpers read the
        // whole document before and after, and `rows` can be megabytes. The
        // fields that matter to the audit are logged by the create above.
        await LeadSourceUpload.updateOne(
            { _id: upload._id },
            {
                $set: {
                    columns: match.columns.map((c) => ({ key: c.key, header: c.header, label: c.label, known: c.known })),
                    missingColumns: match.missingOptional.map((c) => c.label),
                    fileNotes,
                    rows: reportRows.map((row) => ({
                        ...row,
                        ...(sourceIds.has(row.n) ? { sourceId: sourceIds.get(row.n) } : {}),
                    })),
                    counts,
                    status: UPLOAD_STATUS.DONE,
                },
            }
        )
    } catch (error) {
        console.error("[lead-sources] upload failed, rolling back", upload._id, error)
        await LeadSource.deleteMany({ uploadId: upload._id }).catch(() => undefined)
        await LeadSourceUpload.updateOne(
            { _id: upload._id },
            { $set: { status: UPLOAD_STATUS.FAILED, error: "Saving the rows failed. Nothing was imported." } }
        ).catch(() => undefined)
        throw new LeadSourceError("Saving the rows failed. Nothing was imported. Try again.", 500)
    }

    return { uploadId: upload._id.toString(), counts }
}

/** The first sheet that has a complete header row. */
function pickSheet(sheets: SheetGrid[]): { sheet: SheetGrid; headerIndex: number; match: HeaderMatch } {
    let closest: { sheet: SheetGrid; match: HeaderMatch; score: number } | null = null

    for (const sheet of sheets) {
        const found = findHeaderRow(sheet.rows)
        if (!found) continue
        if (found.complete) {
            refuseBadHeaders(found.match)
            return { sheet, headerIndex: found.index, match: found.match }
        }
        const score = found.match.columns.filter((c) => c.known).length
        if (!closest || score > closest.score) closest = { sheet, match: found.match, score }
    }

    if (!closest) {
        throw new LeadSourceError("The file has no rows.", 400)
    }

    const missing = closest.match.missingRequired.map((c) => c.headers[0] ?? c.key)
    throw new LeadSourceError(
        `The header row is missing ${missing.length === 1 ? "a required column" : "required columns"}: ` +
            `${missing.join(", ")}. Download the template to see the expected headers.`,
        400,
        {
            field: "file",
            details: {
                missing,
                found: closest.match.columns.map((c) => c.header),
            },
        }
    )
}

function refuseBadHeaders(match: HeaderMatch): void {
    if (match.duplicates.length > 0) {
        const list = match.duplicates.map((d) => `${d.label} (${d.headers.join(", ")})`).join("; ")
        throw new LeadSourceError(
            `Two columns mean the same thing: ${list}. Keep one of each and upload again.`,
            400,
            { field: "file" }
        )
    }

    if (!LEAD_SOURCE_SHEET_RULES.keepUnknownColumns && match.unknown.length > 0) {
        throw new LeadSourceError(
            `Unknown columns: ${match.unknown.map((c) => c.header).join(", ")}. ` +
                "Remove them, or rename them to a header from the template.",
            400,
            { field: "file" }
        )
    }
}

function describeFile(
    sheets: SheetGrid[],
    sheet: SheetGrid,
    headerIndex: number,
    match: HeaderMatch
): string[] {
    const notes: string[] = []

    if (sheets.length > 1) {
        notes.push(`The file has ${sheets.length} sheets. Read the sheet "${sheet.name}".`)
    }
    if (headerIndex > 0) {
        notes.push(`The header row is row ${headerIndex + 1}. The rows above it were not read.`)
    }
    if (match.unknown.length > 0) {
        notes.push(
            `Columns that are not in the template were kept as extra data: ${match.unknown.map((c) => c.header).join(", ")}.`
        )
    }
    if (match.blankHeaders.length > 0) {
        notes.push(
            `Column ${match.blankHeaders.join(", ")} has values but no header. It was not read.`
        )
    }

    return notes
}

/**
 * Skips rows whose phone is already known.
 *
 * Lead sources are checked in this region only, through the model, so the
 * region scope and soft delete both apply. A deleted source does not block
 * its number from coming back.
 *
 * Leads are checked through the raw driver, in every region and including
 * deleted leads. That is the reach of the unique index on Lead.phone, so a
 * number found here could never be converted anyway. The message never
 * names the lead, so nothing from another region leaks. Same approach as
 * src/lib/leads/findLeadByPhone.ts.
 *
 * Leads are saved in E.164 today, and `npm run mig:03-leads-phone` turned
 * old ones into E.164. For older data this also matches the two plain forms
 * old rows used most: digits with the country code, and the national number.
 * A lead saved in any other form, such as "(415) 555-0123", is not found
 * here. That source is imported, and converting it later gets a clear 409
 * from findLeadPhoneConflict, which matches every form.
 */
async function skipKnownPhones(rows: CheckedRow[], region: RegionCode): Promise<void> {
    const candidates = rows.filter((r) => r.result !== UPLOAD_ROW_RESULT.SKIPPED)
    const phones = [...new Set(candidates.map((r) => r.phone))]
    if (phones.length === 0) return

    // Every stored form to look for, and the E.164 number it stands for.
    const formOf = new Map<string, string>()
    for (const e164 of phones) {
        formOf.set(e164, e164)
        formOf.set(e164.slice(1), e164)
        const national = parsePhoneNumberFromString(e164)?.nationalNumber
        if (national && !formOf.has(national)) formOf.set(national, e164)
    }

    const [sources, leads] = await Promise.all([
        LeadSource.find({ region, phone: { $in: phones } })
            .select("phone status")
            .lean<Array<{ phone: string; status: LeadSourceStatus }>>(),
        Lead.collection
            .find({ phone: { $in: [...formOf.keys()] } }, { projection: { phone: 1, deletedAt: 1 } })
            .toArray(),
    ])

    const sourceByPhone = new Map(sources.map((s) => [s.phone, s]))
    const leadByPhone = new Map<string, (typeof leads)[number]>()
    for (const lead of leads) {
        const e164 = formOf.get(String(lead.phone))
        // A live lead wins over a deleted one with the same number.
        if (e164 && (!leadByPhone.has(e164) || !lead.deletedAt)) leadByPhone.set(e164, lead)
    }

    for (const row of candidates) {
        const lead = leadByPhone.get(row.phone)
        const source = sourceByPhone.get(row.phone)

        let reason: string | null = null
        if (lead) {
            reason = lead.deletedAt
                ? "A deleted lead has this phone number."
                : "This phone number is already a lead in the CRM."
        } else if (source) {
            const label = LEAD_SOURCE_STATUS_META[source.status]?.label ?? "unknown"
            reason = `This phone number is already a lead source (status: ${label}).`
        }

        if (reason) {
            row.result = UPLOAD_ROW_RESULT.SKIPPED
            row.messages = [reason]
        }
    }
}
