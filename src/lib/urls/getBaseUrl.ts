import { NextRequest } from "next/server"

export function getBaseUrl(req: NextRequest): string {
    // Works behind proxies (Vercel, Netlify, etc.) which set x-forwarded-* headers
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
    const proto = req.headers.get("x-forwarded-proto") ?? "https"

    if (host) return `${proto}://${host}`

    // Fallbacks if headers are somehow missing
    if (process.env.APP_LOGIN_URL) return process.env.APP_LOGIN_URL
    return "https://zanservices.com"
}