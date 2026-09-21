import { REGION_CODES, type RegionCode } from "@/lib/region"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"

export class RegionChoiceError extends Error {
    statusCode: number
    field = "region"

    constructor(message: string, statusCode = 400) {
        super(message)
        this.statusCode = statusCode
        Object.setPrototypeOf(this, RegionChoiceError.prototype)
    }
}

/**
 * Works out which region a new top-level record belongs to.
 *
 * Needed for records with no parent to copy a region from: a lead typed in by
 * hand, or a client created without converting a lead. Child records do not
 * need this; regionScopePlugin reads their parent.
 *
 * Two cases:
 *
 *   - The user holds one region. That is the answer, and the request does not
 *     have to say anything.
 *   - The user holds several, which is the admin case. There is no way to
 *     guess, so the request must name one.
 *
 * A requested region is always checked against what the user holds. Without
 * that check a US agent could post `region: "IN"` and write into another
 * team's data, since the field is part of the schema and would otherwise be
 * saved as sent.
 *
 * Throws RegionChoiceError, which routes turn into a 400 or 403.
 */
export function resolveWriteRegion(
    requested: unknown,
    authUser: AuthUser
): RegionCode {
    const mine = authUser.regions ?? []

    if (mine.length === 0) {
        throw new RegionChoiceError(
            "Your account has no region. Ask an admin to set one.",
            403
        )
    }

    if (requested === undefined || requested === null || requested === "") {
        if (mine.length === 1) return mine[0]

        throw new RegionChoiceError(
            `Pick a region. Your account covers: ${mine.join(", ")}.`
        )
    }

    const code = String(requested).trim().toUpperCase()

    if (!(REGION_CODES as readonly string[]).includes(code)) {
        throw new RegionChoiceError(`Unknown region: ${code}`)
    }

    if (!mine.includes(code as RegionCode)) {
        throw new RegionChoiceError(
            `You do not have access to the ${code} region.`,
            403
        )
    }

    return code as RegionCode
}
