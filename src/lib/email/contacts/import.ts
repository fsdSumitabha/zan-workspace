import { Types } from "mongoose"
import { readSheetFile, sheetFileType } from "@/lib/lead-sources/sheet/readSheet"
import { LeadSourceError } from "@/lib/lead-sources/http"
import { EmailError } from "@/lib/email/http"
import EmailContact from "@/models/EmailContact"
import type { RegionCode } from "@/lib/region"
import { ADDRESS_PROBLEM, readAddress } from "@/lib/email/audience/address"
import type { ContactImportResult } from "@/types/email"

/**
 * Imports contacts from a .xlsx or .csv file.
 *
 * It reuses the lead source sheet reader, so the two importers behave the
 * same: every cell comes back as trimmed text, and a row number in the
 * report is the row the person sees in Excel.
 *
 * ## Consent is recorded, not assumed
 *
 * Every imported contact gets `marketingConsent`, `consentSource` and
 * `consentAt`. The source names the file, so months later it is possible
 * to answer "where did this address come from and when did they agree?",
 * which is the question the DPDP Act makes somebody answer.
 *
 * The caller passes the consent flag; the UI makes it an explicit tick with
 * the wording next to it, not a default.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5_000

/** Header names we understand, matched without case, spaces or underscores. */
const COLUMNS: Array<{ key: string; headers: string[] }> = [
    { key: "email", headers: ["email", "emailaddress", "mail", "e-mail"] },
    { key: "firstName", headers: ["firstname", "first", "givenname", "fname"] },
    { key: "lastName", headers: ["lastname", "last", "surname", "familyname", "lname"] },
    { key: "name", headers: ["name", "fullname", "contactname"] },
    { key: "company", headers: ["company", "organisation", "organization", "business", "firm"] },
    { key: "tags", headers: ["tags", "tag", "list", "segment"] },
]

function headerKey(raw: string): string {
    return raw.toLowerCase().replace(/[\s_\-.]/g, "")
}

export interface ImportOptions {
    region: RegionCode
    fileName: string
    userId: string
    /** Whether these contacts have agreed to marketing email. */
    marketingConsent: boolean
    /** Where the consent came from, in the importer's own words. */
    consentNote?: string
    /** Tags applied to every row, on top of any in the file. */
    tags?: string[]
}

export async function importContacts(
    data: ArrayBuffer,
    options: ImportOptions
): Promise<ContactImportResult> {
    const grid = await readGrid(data, options.fileName)

    if (grid.rows.length === 0) {
        throw new EmailError("That file has no rows.", 400, { field: "file" })
    }

    /* ---- Work out which column is which ---- */

    const header = grid.rows[0] ?? []
    const columnOf = new Map<string, number>()

    header.forEach((cell, index) => {
        const key = headerKey(String(cell ?? ""))
        const match = COLUMNS.find((c) => c.headers.includes(key))
        if (match && !columnOf.has(match.key)) columnOf.set(match.key, index)
    })

    if (!columnOf.has("email")) {
        throw new EmailError(
            "No email column was found. The first row must have a heading " +
            `called "Email". Found: ${header.filter(Boolean).join(", ") || "nothing"}.`,
            400,
            { field: "file" }
        )
    }

    const extraColumns = header
        .map((cell, index) => ({ name: String(cell ?? "").trim(), index }))
        .filter(
            (c) =>
                c.name &&
                ![...columnOf.values()].includes(c.index) &&
                c.name.length <= 40
        )
        .slice(0, 10)

    /* ---- Read the rows ---- */

    const body = grid.rows.slice(1, MAX_IMPORT_ROWS + 1)
    const problems: ContactImportResult["problems"] = []
    const seen = new Set<string>()
    const batchId = new Types.ObjectId()
    const now = new Date()

    type Op = {
        updateOne: {
            filter: Record<string, unknown>
            update: Record<string, unknown>
            upsert: true
        }
    }
    const ops: Op[] = []

    body.forEach((row, i) => {
        // +2: one for the header, one because Excel counts from 1.
        const rowNumber = i + 2
        const rawEmail = row[columnOf.get("email")!] ?? ""

        if (!String(rawEmail).trim()) {
            // A blank row at the end of a sheet is normal, not a problem.
            if (row.every((c) => !String(c ?? "").trim())) return
            problems.push({ row: rowNumber, value: "", reason: "No email address" })
            return
        }

        const { address, problem } = readAddress(rawEmail, {
            // An import is explicit, so a role address is allowed here. The
            // audience step still excludes it by default and says so.
            allowRoleAddresses: true,
        })

        if (problem) {
            problems.push({
                row: rowNumber,
                value: String(rawEmail).slice(0, 80),
                reason:
                    problem === ADDRESS_PROBLEM.BLOCKED_DOMAIN
                        ? "Test or throwaway domain"
                        : "Not a valid email address",
            })
            return
        }

        const key = address!.normalized

        if (seen.has(key)) {
            problems.push({
                row: rowNumber,
                value: key,
                reason: "Repeated in this file",
            })
            return
        }
        seen.add(key)

        const cell = (name: string) => {
            const index = columnOf.get(name)
            return index === undefined ? "" : String(row[index] ?? "").trim()
        }

        let firstName = cell("firstName")
        let lastName = cell("lastName")

        // A single "Name" column is split, so {{first_name}} still works.
        if (!firstName && !lastName) {
            const whole = cell("name")
            if (whole) {
                const parts = whole.split(/\s+/)
                firstName = parts[0] ?? ""
                lastName = parts.slice(1).join(" ")
            }
        }

        const fileTags = cell("tags")
            .split(/[,;|]/)
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean)

        const customFields: Record<string, string> = {}
        for (const col of extraColumns) {
            const value = String(row[col.index] ?? "").trim()
            if (value) customFields[headerKey(col.name)] = value.slice(0, 500)
        }

        ops.push({
            updateOne: {
                filter: { region: options.region, emailNormalized: key },
                update: {
                    $set: {
                        email: address!.original,
                        firstName: firstName.slice(0, 100),
                        lastName: lastName.slice(0, 100),
                        company: cell("company").slice(0, 200),
                        marketingConsent: options.marketingConsent,
                        consentSource:
                            options.consentNote?.slice(0, 200) ||
                            `import:${options.fileName}`.slice(0, 200),
                        consentAt: options.marketingConsent ? now : undefined,
                        consentWithdrawnAt: null,
                        customFields,
                        importBatchId: batchId,
                    },
                    $addToSet: {
                        tags: { $each: [...fileTags, ...(options.tags ?? [])] },
                    },
                    $setOnInsert: {
                        region: options.region,
                        emailNormalized: key,
                        createdBy: options.userId,
                    },
                },
                upsert: true,
            },
        })
    })

    /* ---- Write ---- */

    let created = 0
    let updated = 0

    if (ops.length > 0) {
        // Unordered: one bad row must not stop the other 499.
        const result = await EmailContact.bulkWrite(ops, { ordered: false })
        created = result.upsertedCount ?? 0
        updated = result.modifiedCount ?? 0
    }

    return {
        fileName: options.fileName,
        rowsRead: body.length,
        created,
        updated,
        skipped: problems.length,
        problems: problems.slice(0, 200),
    }
}

/**
 * Reads the file, converting the sheet reader's errors into email ones.
 *
 * The reader is shared with lead sources and throws LeadSourceError, which
 * the email routes' errorResponse does not know about. Converting here
 * keeps that detail out of every route.
 */
async function readGrid(data: ArrayBuffer, fileName: string) {
    try {
        const type = sheetFileType(fileName)
        const sheets = await readSheetFile(data, type)

        if (sheets.length === 0 || !sheets[0]) {
            throw new EmailError("That file has no sheets.", 400, {
                field: "file",
            })
        }

        return sheets[0]
    } catch (error) {
        if (error instanceof LeadSourceError) {
            throw new EmailError(error.message, error.statusCode, {
                field: "file",
            })
        }
        throw error
    }
}
