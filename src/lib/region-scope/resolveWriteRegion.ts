import { REGION_CODES, type RegionCode } from "@/lib/region"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { getRegionContext } from "./regionContext"

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
 * It works from the regions this request is viewing, not from every region
 * the account holds. requireAuth narrows those when a region is pinned in the
 * header. So:
 *
 *   - One region in view, because the user holds one or pinned one. That is
 *     the answer, and the request does not have to say anything.
 *   - Several in view, which is an admin on "all regions". There is no way
 *     to guess, so the request must name one.
 *
 * A requested region must be one the account holds. Without that check a US
 * agent could post `region: "IN"` and write into another team's data, since
 * the field is part of the schema and would otherwise be saved as sent.
 *
 * It must also be in view. An admin pinned to US who creates an IN lead is
 * sent to the new lead's page, and a session pinned to US cannot read it. So
 * the request is refused with a clear message instead.
 *
 * Throws RegionChoiceError, which routes turn into a 400 or 403.
 */
export function resolveWriteRegion(
    requested: unknown,
    authUser: AuthUser
): RegionCode {
    const held = authUser.regions ?? []

    if (held.length === 0) {
        throw new RegionChoiceError(
            "Your account has no region. Ask an admin to set one.",
            403
        )
    }

    const ctx = getRegionContext()
    const inView = ctx && !ctx.bypass ? ctx.regions : held

    if (requested === undefined || requested === null || requested === "") {
        if (ctx?.writeRegion) return ctx.writeRegion
        if (inView.length === 1) return inView[0]

        throw new RegionChoiceError(
            `Pick a region. You are viewing: ${inView.join(", ")}.`
        )
    }

    const code = String(requested).trim().toUpperCase()

    if (!(REGION_CODES as readonly string[]).includes(code)) {
        throw new RegionChoiceError(`Unknown region: ${code}`)
    }

    if (!held.includes(code as RegionCode)) {
        throw new RegionChoiceError(
            `You do not have access to the ${code} region.`,
            403
        )
    }

    if (!inView.includes(code as RegionCode)) {
        throw new RegionChoiceError(
            `You are viewing ${inView.join(", ")}. Switch to ${code} in the ` +
            `header to create a record there.`
        )
    }

    return code as RegionCode
}
