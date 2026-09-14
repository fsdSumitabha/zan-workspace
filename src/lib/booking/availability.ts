import {
    getBusyIntervals,
    getDefaultTimeZone,
    type BusyInterval,
} from "@/lib/google/calendar/calendar"

// ---------------------------------------------------------------------------
// Booking rules — the single place that defines what a client may book.
// Both the slots listing and the booking endpoint validate against these, so
// the server never trusts a slot just because the page offered it.
// ---------------------------------------------------------------------------

export const BOOKING_RULES = {
    /** Days of the week the office takes meetings (0 = Sunday … 6 = Saturday). */
    officeDays: [1, 2, 3, 4, 5],
    /** Office opening time, minutes after midnight in the calendar time zone. */
    officeStartMinutes: 11 * 60,
    /** Office closing time — the last slot must END by this. */
    officeEndMinutes: 20 * 60,
    /** Length of a bookable meeting, and the step between slot starts. */
    slotMinutes: 30,
    /** How many days ahead (today included) clients can book. */
    windowDays: 14,
    /** Minimum lead time between now and the start of a bookable slot. */
    minNoticeMinutes: 120,
} as const

export function getBookingTimeZone(): string {
    return getDefaultTimeZone()
}

export interface AvailabilitySlot {
    /** Slot start as an ISO (UTC) string. */
    start: string
    available: boolean
}

export interface AvailabilityDay {
    /** Calendar date in the booking time zone, "YYYY-MM-DD". */
    date: string
    slots: AvailabilitySlot[]
}

// ---------------------------------------------------------------------------
// Time zone helpers (Intl-based, no dependency on the server's local zone)
// ---------------------------------------------------------------------------

interface ZonedParts {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getZonedParts(date: Date, timeZone: string): ZonedParts {
    let fmt = formatterCache.get(timeZone)
    if (!fmt) {
        fmt = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
        formatterCache.set(timeZone, fmt)
    }
    const parts = fmt.formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value)

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: get("hour") % 24,
        minute: get("minute"),
        second: get("second"),
    }
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function getOffsetMs(date: Date, timeZone: string): number {
    const p = getZonedParts(date, timeZone)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Converts a wall-clock time in `timeZone` to the matching UTC instant. */
function zonedWallTimeToUtc(
    year: number,
    month: number,
    day: number,
    minutesOfDay: number,
    timeZone: string
): Date {
    const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay)
    const firstOffset = getOffsetMs(new Date(guess), timeZone)
    let result = guess - firstOffset
    // Second pass corrects the rare case where the offset differs across a DST edge.
    const secondOffset = getOffsetMs(new Date(result), timeZone)
    if (secondOffset !== firstOffset) result = guess - secondOffset
    return new Date(result)
}

function toDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Calendar date (y/m/d) `offsetDays` after the given one. */
function addDays(year: number, month: number, day: number, offsetDays: number) {
    const d = new Date(Date.UTC(year, month - 1, day + offsetDays))
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        weekday: d.getUTCDay(),
    }
}

function overlapsBusy(start: Date, end: Date, busy: BusyInterval[]): boolean {
    return busy.some((b) => b.start < end && b.end > start)
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/** The instant range covered by the booking window, starting today. */
export function getBookingRange(now: Date = new Date()): { start: Date; end: Date } {
    const tz = getBookingTimeZone()
    const today = getZonedParts(now, tz)
    const last = addDays(today.year, today.month, today.day, BOOKING_RULES.windowDays - 1)

    return {
        start: zonedWallTimeToUtc(today.year, today.month, today.day, 0, tz),
        end: zonedWallTimeToUtc(last.year, last.month, last.day, BOOKING_RULES.officeEndMinutes, tz),
    }
}

/** Builds every office-hours slot in the booking window, flagged free/taken. */
export function buildAvailability(
    busy: BusyInterval[],
    now: Date = new Date()
): AvailabilityDay[] {
    const tz = getBookingTimeZone()
    const today = getZonedParts(now, tz)
    const earliestStart = now.getTime() + BOOKING_RULES.minNoticeMinutes * 60_000
    const days: AvailabilityDay[] = []

    for (let i = 0; i < BOOKING_RULES.windowDays; i++) {
        const d = addDays(today.year, today.month, today.day, i)
        const slots: AvailabilitySlot[] = []

        if ((BOOKING_RULES.officeDays as readonly number[]).includes(d.weekday)) {
            for (
                let m = BOOKING_RULES.officeStartMinutes;
                m + BOOKING_RULES.slotMinutes <= BOOKING_RULES.officeEndMinutes;
                m += BOOKING_RULES.slotMinutes
            ) {
                const start = zonedWallTimeToUtc(d.year, d.month, d.day, m, tz)
                const end = new Date(start.getTime() + BOOKING_RULES.slotMinutes * 60_000)

                slots.push({
                    start: start.toISOString(),
                    available:
                        start.getTime() >= earliestStart &&
                        !overlapsBusy(start, end, busy),
                })
            }
        }

        days.push({ date: toDateKey(d.year, d.month, d.day), slots })
    }

    return days
}

/**
 * Checks that `start` is a real slot under the booking rules: an office day,
 * inside office hours, aligned to the slot grid, inside the window and past
 * the minimum notice. Does NOT check the calendar — see `isSlotFree`.
 */
export function isBookableSlotStart(start: Date, now: Date = new Date()): boolean {
    if (Number.isNaN(start.getTime())) return false
    if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) return false

    const earliestStart = now.getTime() + BOOKING_RULES.minNoticeMinutes * 60_000
    if (start.getTime() < earliestStart) return false

    const tz = getBookingTimeZone()
    const p = getZonedParts(start, tz)
    const today = getZonedParts(now, tz)

    const dayIndex = Math.round(
        (Date.UTC(p.year, p.month - 1, p.day) -
            Date.UTC(today.year, today.month - 1, today.day)) /
            86_400_000
    )
    if (dayIndex < 0 || dayIndex >= BOOKING_RULES.windowDays) return false

    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
    if (!(BOOKING_RULES.officeDays as readonly number[]).includes(weekday)) return false

    const minutesOfDay = p.hour * 60 + p.minute
    return (
        minutesOfDay >= BOOKING_RULES.officeStartMinutes &&
        minutesOfDay + BOOKING_RULES.slotMinutes <= BOOKING_RULES.officeEndMinutes &&
        (minutesOfDay - BOOKING_RULES.officeStartMinutes) % BOOKING_RULES.slotMinutes === 0
    )
}

/** Live (uncached) check against Google that nothing overlaps the slot. */
export async function isSlotFree(start: Date): Promise<boolean> {
    const end = new Date(start.getTime() + BOOKING_RULES.slotMinutes * 60_000)
    const busy = await getBusyIntervals(start, end)
    return !overlapsBusy(start, end, busy)
}

// ---------------------------------------------------------------------------
// Short-lived cache for the public slots listing.
// The page can be opened by many visitors at once; a few seconds of staleness
// is harmless because the booking endpoint always re-checks live.
// ---------------------------------------------------------------------------

const BUSY_CACHE_TTL_MS = 30_000
let busyCache: { key: string; expiresAt: number; busy: BusyInterval[] } | null = null

export async function getCachedBusyForWindow(now: Date = new Date()): Promise<BusyInterval[]> {
    const range = getBookingRange(now)
    const key = range.start.toISOString()

    if (busyCache && busyCache.key === key && busyCache.expiresAt > now.getTime()) {
        return busyCache.busy
    }

    const busy = await getBusyIntervals(range.start, range.end)
    busyCache = { key, expiresAt: now.getTime() + BUSY_CACHE_TTL_MS, busy }
    return busy
}

export function invalidateBusyCache(): void {
    busyCache = null
}
