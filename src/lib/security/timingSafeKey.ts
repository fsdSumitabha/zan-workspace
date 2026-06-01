import { timingSafeEqual } from "crypto"

/**
 * Constant-time comparison of an incoming `x-api-key` header against
 * `CLIENT_PORTAL_API_KEY`. Used by the public lead-intake endpoint so
 * a static client site can call without a user session.
 *
 * NOTE: the key ships in the static site's JS bundle and is therefore
 * not a real secret — its job is to filter casual abuse, not to
 * authenticate. The meaningful protections live alongside it (origin
 * allowlist, rate limit, honeypot).
 *
 * `timingSafeEqual` throws on unequal buffer lengths; we pre-check the
 * length so the timing-safety guarantee still holds (length mismatch
 * leaks at most that the wrong-length key is wrong, not which bytes).
 */
export function verifyClientPortalKey(
    provided: string | null | undefined
): boolean {
    const expected = process.env.CLIENT_PORTAL_API_KEY || ""
    if (!expected || !provided) return false

    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false

    return timingSafeEqual(a, b)
}
