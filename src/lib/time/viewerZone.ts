import type { NextRequest } from "next/server"
import { readViewerTimeZone } from "@/lib/auth/requestCredentials"
import { DEFAULT_TIME_ZONE, normalizeTimeZone, zoneForRegion } from "./zone"

interface ZoneHints {
    timeZone?: string | null
    regions?: readonly string[]
}

/**
 * The time zone of the person making this request. Server code uses it when
 * the answer depends on their calendar day, such as the "Today" filter.
 *
 * In this order:
 * 1. The zone their browser or phone sent with the request.
 * 2. The zone saved on their account (the browser saves it, see AuthContext).
 * 3. Their region's zone, when they hold one region only.
 * 4. India.
 *
 * Never the server's own zone, which is UTC on Vercel.
 */
export function resolveViewerZone(req: NextRequest, user?: ZoneHints | null): string {
    return (
        readViewerTimeZone(req) ??
        normalizeTimeZone(user?.timeZone) ??
        (user?.regions?.length === 1 ? zoneForRegion(user.regions[0]) : null) ??
        DEFAULT_TIME_ZONE
    )
}
