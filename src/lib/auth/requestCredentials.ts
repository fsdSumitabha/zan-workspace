import { NextRequest } from "next/server"
import { ACTIVE_REGION_COOKIE } from "@/lib/region-scope"

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
