import { parsePhoneNumberFromString } from "libphonenumber-js"
import { LEAD_IMPORT_ROW_RESULT, isImportedResult } from "@/constants/adTracking"
import { DELETED_LEAD_MESSAGE, DUPLICATE_LEAD_MESSAGE } from "@/lib/leads/findLeadByPhone"
import Lead from "@/models/Lead"
import type { CheckedLeadRow } from "./checkRows"

/**
 * Marks rows whose lead is already in the CRM as duplicates.
 *
 * Two queries for the whole file, never one per row:
 *
 *   1. by the platform's lead id (Lead.externalLeadId), which the Facebook
 *      webhook sets too, so a lead that came in live is matched exactly;
 *   2. by phone, in every stored form, the same way the lead source upload
 *      does it (see skipKnownPhones in src/lib/lead-sources/upload.ts).
 *
 * Both read the collection directly: every region, deleted leads included.
 * That is the reach of the unique indexes on Lead.phone and
 * Lead.externalLeadId, so a lead found here could never be inserted anyway.
 * The message never names the other lead, so nothing from another region
 * leaks.
 */
export async function markExistingLeads(rows: CheckedLeadRow[]): Promise<void> {
    const candidates = rows.filter((r) => isImportedResult(r.result))
    if (candidates.length === 0) return

    const phones = [...new Set(candidates.map((r) => r.phone))]
    const leadIds = [...new Set(candidates.map((r) => r.externalLeadId).filter((id): id is string => !!id))]

    // Every stored form of each number, and the E.164 number it stands for.
    const formOf = new Map<string, string>()
    for (const e164 of phones) {
        formOf.set(e164, e164)
        formOf.set(e164.slice(1), e164)
        const national = parsePhoneNumberFromString(e164)?.nationalNumber
        if (national && !formOf.has(national)) formOf.set(national, e164)
    }

    const or: Record<string, unknown>[] = [{ phone: { $in: [...formOf.keys()] } }]
    if (leadIds.length > 0) or.push({ externalLeadId: { $in: leadIds } })

    const found = await Lead.collection
        .find(
            { $or: or },
            { projection: { phone: 1, externalLeadId: 1, deletedAt: 1, region: 1, sourceReference: 1 } }
        )
        .toArray()

    const byLeadId = new Map<string, (typeof found)[number]>()
    const byPhone = new Map<string, (typeof found)[number]>()
    for (const lead of found) {
        if (typeof lead.externalLeadId === "string") byLeadId.set(lead.externalLeadId, lead)
        const e164 = formOf.get(String(lead.phone))
        // A live lead wins over a deleted one with the same number.
        if (e164 && (!byPhone.has(e164) || !lead.deletedAt)) byPhone.set(e164, lead)
    }

    for (const row of candidates) {
        const sameLead = row.externalLeadId ? byLeadId.get(row.externalLeadId) : undefined
        const lead = sameLead ?? byPhone.get(row.phone)
        if (!lead) continue

        const deleted = !!lead.deletedAt
        let reason: string
        if (sameLead) {
            reason = deleted
                ? "This Meta lead was imported before, and that lead was deleted."
                : "This Meta lead is already in the CRM."
        } else {
            reason = deleted ? DELETED_LEAD_MESSAGE : DUPLICATE_LEAD_MESSAGE
        }

        row.result = LEAD_IMPORT_ROW_RESULT.DUPLICATE
        row.messages = [reason]
        row.existing = {
            _id: lead._id,
            region: typeof lead.region === "string" ? lead.region : undefined,
            deleted,
            hasSource: !!lead.sourceReference,
            hasExternalId: typeof lead.externalLeadId === "string",
        }
    }
}
