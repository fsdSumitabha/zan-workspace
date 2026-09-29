import { Types } from "mongoose"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { canManageLeadSources } from "@/constants/leadSourceRoles"
import LeadSource from "@/models/LeadSource"
import { LeadSourceError } from "./http"

/**
 * Who sees which lead source, on top of the region scope.
 *
 * The region scope is applied by regionScopePlugin on every query, like
 * everywhere else. This adds the second rule: a manager sees every lead
 * source in their regions, and anyone else sees only the ones assigned to
 * them. Every read and write in the lead source routes adds this filter.
 */
export function accessFilter(user: AuthUser): Record<string, unknown> {
    if (canManageLeadSources(user.role)) return {}
    return { assignedTo: new Types.ObjectId(user.id) }
}

const OBJECT_ID = /^[a-f0-9]{24}$/i

/**
 * A 24-character hex id as an ObjectId, or a 400.
 *
 * Stricter than Types.ObjectId.isValid, which also accepts any 12-character
 * string.
 */
export function parseObjectId(raw: unknown, what = "id"): Types.ObjectId {
    if (typeof raw !== "string" || !OBJECT_ID.test(raw)) {
        throw new LeadSourceError(`Invalid ${what}.`, 400)
    }
    return new Types.ObjectId(raw)
}

/**
 * Loads one lead source the caller may see, or throws a 404.
 *
 * A source in another region, or assigned to someone else, gets the same 404
 * as one that does not exist. The answer does not confirm that it exists.
 */
export async function findVisibleSource(id: string, user: AuthUser) {
    const _id = parseObjectId(id, "lead source id")
    const source = await LeadSource.findOne({ _id, ...accessFilter(user) })
    if (!source) throw new LeadSourceError("Lead source not found.", 404)
    return source
}
