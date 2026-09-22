import { REGION_CODES, ALL_REGIONS, type RegionCode } from "@/lib/region"

/**
 * The region a person has narrowed their session to.
 *
 * Someone who holds several regions sees all of them by default. This lets
 * them pin the session to one, and unpin it again, without signing out.
 *
 * ## Why a cookie and not the JWT
 *
 * The token is not the source of truth for regions, on purpose. It lasts 7
 * days, so a region removed from an account would stay live for a week.
 * `requireAuth` reads the user row on every request instead.
 *
 * Re-issuing the token on every switch would mean either trusting the token
 * again, which brings that problem back, or writing to it for no effect. A
 * separate cookie carries the choice and the user row still decides what the
 * choice is allowed to be.
 *
 * ## Why it is safe for the client to control it
 *
 * This only ever NARROWS. The result is always a subset of what the user row
 * says. Forging the cookie lets somebody restrict themselves to a region they
 * already hold, which they can do from the UI anyway. There is no value that
 * widens access, so the cookie never needs to be trusted.
 *
 * Clearing it, or sending "ALL", restores every region the account holds.
 */

export const ACTIVE_REGION_COOKIE = "active_region"

export interface RegionSelection {
    /** Regions to read. Always a subset of what the account holds. */
    regions: RegionCode[]

    /** Region to stamp on new records. Null when more than one is in view. */
    writeRegion: RegionCode | null

    /** What the UI should show as selected. */
    active: RegionCode | typeof ALL_REGIONS
}

/**
 * Works out the session's regions from the account's regions and the cookie.
 *
 * An unreadable, unknown or not-held cookie value is ignored rather than
 * rejected. A stale pin left over from a previous sign-in on the same browser
 * must not lock the next person out of their own data.
 */
export function narrowToActiveRegion(
    cookieValue: string | undefined | null,
    accountRegions: RegionCode[]
): RegionSelection {
    const all: RegionSelection = {
        regions: accountRegions,
        writeRegion: accountRegions.length === 1 ? accountRegions[0] : null,
        active: accountRegions.length === 1 ? accountRegions[0] : ALL_REGIONS,
    }

    if (!cookieValue) return all

    const code = cookieValue.trim().toUpperCase()

    if (code === ALL_REGIONS) return all
    if (!(REGION_CODES as readonly string[]).includes(code)) return all

    const picked = code as RegionCode

    // The account no longer holds it, or never did. Fall back to everything.
    if (!accountRegions.includes(picked)) return all

    return {
        regions: [picked],
        writeRegion: picked,
        active: picked,
    }
}

/** Validates a requested value before it is written to the cookie. */
export function isSelectableRegion(
    raw: unknown,
    accountRegions: RegionCode[]
): raw is RegionCode | typeof ALL_REGIONS {
    const code = String(raw ?? "").trim().toUpperCase()
    if (code === ALL_REGIONS) return true
    return accountRegions.includes(code as RegionCode)
}
