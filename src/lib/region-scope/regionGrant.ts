import { REGION_CODES, type RegionCode } from "@/lib/region"
import { canAdministerAllRegions } from "@/constants/userRoles"
import { RegionChoiceError } from "./resolveWriteRegion"

/**
 * Reads the `regions` field off a form body.
 *
 * Accepts either repeated `regions` entries or one JSON array, so an HTML
 * form and a scripted request can both post it. Values are upper-cased and
 * de-duplicated, not validated — `resolveGrantedRegions` does that.
 */
export function parseRegionsInput(values: FormDataEntryValue[]): string[] {
    const flat = values.flatMap((v) => {
        const text = v.toString().trim()

        if (text.startsWith("[")) {
            try {
                const parsed = JSON.parse(text)
                return Array.isArray(parsed) ? parsed.map(String) : []
            } catch {
                return []
            }
        }

        return text ? [text] : []
    })

    return [...new Set(flat.map((r) => r.trim().toUpperCase()).filter(Boolean))]
}

export interface GrantInput {
    /** What the request asked for. */
    submitted: string[]

    /** Regions the signed-in user holds. */
    granter: RegionCode[]

    /**
     * The signed-in user's role. HR and admin hire for every region, so
     * they may grant any region rather than only the ones they hold.
     * See CROSS_REGION_USER_ADMIN_ROLES in src/constants/userRoles.ts.
     */
    granterRole?: number

    /** Regions the account already holds. Empty when creating. */
    existing?: RegionCode[]
}

/**
 * Works out the regions an account should end up with.
 *
 * Three rules:
 *
 * 1. You cannot hand out a region you do not hold yourself, unless your role
 *    administers users across regions. Without the first half, a regional
 *    manager could create an account in another team's region and sign in as
 *    it. Without the second half, HR could not hire for a region they do not
 *    sell into.
 *
 * 2. Regions the account already holds that you do not are kept. A person who
 *    covers India only must be able to edit a colleague's name without
 *    silently stripping that colleague's US access.
 *
 * 3. The result is never empty. A user with no regions is denied every query,
 *    which reads as an empty database to them rather than as an error.
 *
 * Throws RegionChoiceError, which the routes turn into a 400 or 403.
 */
export function resolveGrantedRegions({
    submitted,
    granter,
    granterRole,
    existing = [],
}: GrantInput): RegionCode[] {
    const unknown = submitted.filter(
        (r) => !(REGION_CODES as readonly string[]).includes(r)
    )

    if (unknown.length > 0) {
        throw new RegionChoiceError(
            `Unknown region: ${unknown.join(", ")}`,
            400
        )
    }

    const codes = submitted as RegionCode[]

    // HR and admin hire for every region.
    const grantable: RegionCode[] =
        granterRole !== undefined && canAdministerAllRegions(granterRole)
            ? [...REGION_CODES]
            : granter

    // Rule 2: anything the account already has and the granter cannot touch.
    const untouchable = existing.filter((r) => !grantable.includes(r))

    // Rule 1: everything else has to be a region the granter may grant.
    const notMine = codes.filter(
        (r) => !grantable.includes(r) && !untouchable.includes(r)
    )

    if (notMine.length > 0) {
        throw new RegionChoiceError(
            `You do not have access to: ${notMine.join(", ")}`,
            403
        )
    }

    const result = [
        ...new Set([
            ...untouchable,
            ...codes.filter((r) => grantable.includes(r)),
        ]),
    ]

    // Rule 3.
    if (result.length === 0) {
        throw new RegionChoiceError("Pick at least one region", 400)
    }

    // Stable order, so the stored array does not churn between saves.
    return REGION_CODES.filter((r) => result.includes(r))
}

export { RegionChoiceError }
