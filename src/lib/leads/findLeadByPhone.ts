import { Types } from "mongoose"
import Lead from "@/models/Lead"
import { phoneLookupCondition } from "@/lib/phone"
import type { CountryCode } from "libphonenumber-js"

export const DUPLICATE_LEAD_MESSAGE = "Another lead already has this phone number."
export const DELETED_LEAD_MESSAGE = "A deleted lead has this phone number."

/**
 * Finds a lead that already uses this phone number, deleted leads included.
 *
 * The unique index on `phone` covers deleted leads, but Lead.find() hides
 * them. So this reads the collection directly. It returns the message to
 * show, or null when the number is free.
 *
 * Reading the collection directly also means no region filter, and that is
 * correct. The index this guards is global. A region-filtered check would
 * pass, the insert would then hit the index, and the user would get a 500
 * instead of a clear message.
 *
 * The cost is a dead end: a user can be told a number is taken by a lead
 * they cannot see. The message never includes the lead, so nothing leaks.
 * Making the message say "another region" is tracked in
 * docs/region-rollout.md section 1.4.
 */
export async function findLeadPhoneConflict(
    e164: string,
    defaultCountry: CountryCode,
    excludeId?: string
): Promise<string | null> {
    const filter: Record<string, unknown> = {
        phone: phoneLookupCondition(e164, defaultCountry),
    }
    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) }

    const found = await Lead.collection.findOne(filter, { projection: { deletedAt: 1 } })
    if (!found) return null
    return found.deletedAt ? DELETED_LEAD_MESSAGE : DUPLICATE_LEAD_MESSAGE
}
