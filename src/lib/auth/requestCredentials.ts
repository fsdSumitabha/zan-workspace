import { NextRequest } from "next/server"
import { ACTIVE_REGION_COOKIE } from "@/lib/region-scope"
import { normalizeTimeZone } from "@/lib/time/zone"

/**
 * Where a request's credentials come from.
 *
 * The web app sends an httpOnly cookie. The mobile app cannot rely on one, so
 * it sends the same JWT as `Authorization: Bearer <jwt>` and the active region
 * as `X-Active-Region`. The cookie wins when both are present, so the web app
 * behaves exactly as before.
 */

export const ACTIVE_REGION_HEADER = "x-active-region"

/** The JWT from the auth_token cookie, or from an Authorization: Bearer header. */
export function readAuthToken(req: NextRequest): string | undefined {
    const cookie = req.cookies.get("auth_token")?.value
    if (cookie) return cookie

    const header = req.headers.get("authorization")
    const match = header?.match(/^Bearer\s+(\S+)\s*$/i)

    return match?.[1] || undefined
}

/**
 * The region the session is narrowed to, from the active_region cookie or the
 * X-Active-Region header. Pass the result to narrowToActiveRegion, which only
 * ever narrows to regions the account holds and ignores anything else, so the
 * header is exactly as safe as the cookie.
 */
export function readActiveRegion(req: NextRequest): string | undefined {
    return (
        req.cookies.get(ACTIVE_REGION_COOKIE)?.value ||
        req.headers.get(ACTIVE_REGION_HEADER) ||
        undefined
    )
}

export const TIME_ZONE_COOKIE = "tz"
export const TIME_ZONE_HEADER = "x-time-zone"

/**
 * The time zone of the device that sent the request. The web app sets the
 * `tz` cookie in the root layout. The phone app can send `X-Time-Zone`.
 * Returns null when neither holds a real zone name.
 *
 * Not a credential. It only says which calendar day "today" is for this
 * person, so a wrong value shows the wrong day and nothing more.
 */
export function readViewerTimeZone(req: NextRequest): string | null {
    const raw =
        req.cookies.get(TIME_ZONE_COOKIE)?.value ||
        req.headers.get(TIME_ZONE_HEADER) ||
        ""
    let value = raw
    try {
        value = decodeURIComponent(raw)
    } catch {
        // A broken %-escape. normalizeTimeZone refuses it below.
    }
    return normalizeTimeZone(value)
}
