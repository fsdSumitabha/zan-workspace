import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/security/rateLimit"
import { getClientIp } from "@/lib/security/clientIp"
import {
    isGoogleAuthError,
    isGoogleCalendarConfigured,
} from "@/lib/google/calendar/calendar"
import {
    BOOKING_RULES,
    buildAvailability,
    getBookingTimeZone,
    getCachedBusyForWindow,
} from "@/lib/booking/availability"

export const runtime = "nodejs"

const RATE_LIMIT = 60
const RATE_WINDOW_MS = 10 * 60 * 1000

const UNAVAILABLE_MESSAGE =
    "Online booking is temporarily unavailable. Please try again shortly."

function noStore(res: NextResponse): NextResponse {
    res.headers.set("Cache-Control", "no-store")
    return res
}

/**
 * Public: lists office-hours slots for the booking window with a free/taken
 * flag. Exposes only slot times — never any calendar event details.
 */
export async function GET(req: NextRequest) {
    const rl = checkRateLimit(
        `public-booking-slots:${getClientIp(req)}`,
        RATE_LIMIT,
        RATE_WINDOW_MS
    )
    if (!rl.allowed) {
        const res = NextResponse.json(
            { success: false, message: "Too many requests" },
            { status: 429 }
        )
        res.headers.set("Retry-After", String(rl.retryAfterSec))
        return noStore(res)
    }

    if (!isGoogleCalendarConfigured()) {
        console.error("[booking] Google Calendar env vars are not configured")
        return noStore(
            NextResponse.json(
                { success: false, message: UNAVAILABLE_MESSAGE },
                { status: 503 }
            )
        )
    }

    try {
        const now = new Date()
        const busy = await getCachedBusyForWindow(now)

        return noStore(
            NextResponse.json({
                success: true,
                data: {
                    timeZone: getBookingTimeZone(),
                    slotMinutes: BOOKING_RULES.slotMinutes,
                    officeDays: BOOKING_RULES.officeDays,
                    officeStartMinutes: BOOKING_RULES.officeStartMinutes,
                    officeEndMinutes: BOOKING_RULES.officeEndMinutes,
                    days: buildAvailability(busy, now),
                },
            })
        )
    } catch (err) {
        if (isGoogleAuthError(err)) {
            console.error(
                "[booking] Google rejected the refresh token (invalid_grant). Re-authorize and update GOOGLE_CALENDAR_REFRESH_TOKEN."
            )
        } else {
            console.error("[booking] Failed to load availability:", err)
        }
        return noStore(
            NextResponse.json(
                { success: false, message: UNAVAILABLE_MESSAGE },
                { status: 503 }
            )
        )
    }
}
