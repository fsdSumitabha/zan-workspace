import { NextResponse } from "next/server"

/**
 * Returns the matched origin if the incoming `Origin` header is on the
 * `CLIENT_PORTAL_ORIGIN` allowlist (comma-separated env). Null
 * otherwise — including when no Origin header was sent.
 *
 * We echo back the *matched* origin (not `*`) because the endpoint
 * accepts a custom `x-api-key` header, which credentialed-style CORS
 * (any non-simple header) requires an explicit origin for.
 */
export function resolveAllowedOrigin(
    requestOrigin: string | null
): string | null {
    if (!requestOrigin) return null
    const allowed = (process.env.CLIENT_PORTAL_ORIGIN || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    return allowed.includes(requestOrigin) ? requestOrigin : null
}

/**
 * Attach CORS response headers. If `origin` is null (disallowed or
 * absent) we omit `Access-Control-Allow-Origin` — browsers will then
 * block the response from JS, which is the desired outcome.
 *
 * Applied via this helper on every response path (including errors) so
 * a thrown branch can't accidentally ship a header-less reply that the
 * browser surfaces as a confusing "CORS error" instead of the real
 * status code.
 */
export function withCors<T extends NextResponse>(
    res: T,
    origin: string | null
): T {
    if (origin) {
        res.headers.set("Access-Control-Allow-Origin", origin)
    }
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key")
    res.headers.set("Vary", "Origin")
    return res
}
