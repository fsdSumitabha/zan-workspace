import type { NextRequest } from "next/server"

/** Best-effort client IP for rate-limit keys (first hop of x-forwarded-for). */
export function getClientIp(req: NextRequest): string {
    const xff = req.headers.get("x-forwarded-for")
    if (xff) {
        const first = xff.split(",")[0]?.trim()
        if (first) return first
    }
    return req.headers.get("x-real-ip") || "unknown"
}
