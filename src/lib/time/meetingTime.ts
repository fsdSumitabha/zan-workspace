// Meeting times. Safe on the server and in the browser.
//
// A meeting has one exact moment, `scheduledAt`, saved in UTC. It also has the
// client's time zone, `timeZone`. Each person sees the moment in their own
// zone. When the client's zone is different, they see the client's time too.
// See docs/time-zones.md.

import {
    dateKeyInZone,
    daysBetweenKeys,
    formatClock,
    formatDayMonth,
    formatWeekdayLong,
    formatWeekdayShort,
    normalizeTimeZone,
    sameClock,
    wallTimeToUtc,
    zoneAbbr,
    zoneForRegion,
} from "./zone"

/** The fields of a meeting that decide its client's zone. */
export interface MeetingZoneFields {
    timeZone?: string | null
    region?: string | null
}

/**
 * The client's time zone for a meeting: the zone saved on it, else the zone
 * of its region. Meetings made before 19 Nov 2026 have no zone saved.
 */
export function meetingZone(meeting: MeetingZoneFields | null | undefined): string {
    return normalizeTimeZone(meeting?.timeZone) ?? zoneForRegion(meeting?.region)
}

// An ISO time that names its zone: ends in "Z" or in an offset such as "+05:30".
const HAS_ZONE_RE = /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

/**
 * Reads a meeting start time from a request body.
 *
 * - "2026-11-19T08:00:00.000Z" or "2026-11-19T13:30:00+05:30" names one exact
 *   moment, and is used as it is. The web form and the phone app send this.
 * - "2026-11-19T13:30" names no zone. It is read as a clock time in
 *   `timeZone`. With no `timeZone` it is refused.
 *
 * The server never reads a time in its own zone. Its zone is UTC, and that
 * guess is what moved a 1:30 PM IST meeting to 7:00 PM IST.
 *
 * Returns null when the value cannot be read.
 */
export function parseMeetingStart(raw: unknown, timeZone?: string | null): Date | null {
    if (typeof raw !== "string") return null
    const value = raw.trim()
    if (!value) return null

    if (HAS_ZONE_RE.test(value)) {
        const d = new Date(value)
        return isNaN(d.getTime()) ? null : d
    }

    const zone = normalizeTimeZone(timeZone)
    return zone ? wallTimeToUtc(value, zone) : null
}

/** True once the meeting's start time has passed. */
export function hasMeetingStarted(at: string | Date, now: Date = new Date()): boolean {
    const t = new Date(at).getTime()
    return !isNaN(t) && t <= now.getTime()
}

/**
 * The day of `at` as a word, in `zone`: "today", "tomorrow", "yesterday",
 * "Wednesday" for the next five days, else "19 Nov".
 */
export function relativeDayWords(at: Date, zone: string, now: Date = new Date()): string {
    const diff = daysBetweenKeys(dateKeyInZone(now, zone), dateKeyInZone(at, zone))
    if (diff === 0) return "today"
    if (diff === 1) return "tomorrow"
    if (diff === -1) return "yesterday"
    if (diff > 1 && diff < 7) return formatWeekdayLong(at, zone)
    return formatDayMonth(at, zone, now)
}

/**
 * A meeting time in words for one reader, in lower case to sit inside a
 * sentence:
 *
 *   "tomorrow at 1:30 PM IST"
 *   "tomorrow at 1:30 PM IST (client: 12:00 PM GST)"      client in Dubai
 *   "Wednesday at 3:00 AM EST (client: Wed 1:30 PM IST)"  reader in New York
 *
 * The client's weekday is added only when it is a different day for them.
 */
export function meetingTimeWords(
    at: Date,
    readerZone: string,
    clientZone: string,
    now: Date = new Date()
): string {
    const main = `${relativeDayWords(at, readerZone, now)} at ${formatClock(at, readerZone)} ${zoneAbbr(readerZone, at)}`
    if (sameClock(at, readerZone, clientZone)) return main

    const otherDay = dateKeyInZone(at, readerZone) !== dateKeyInZone(at, clientZone)
    const day = otherDay ? `${formatWeekdayShort(at, clientZone)} ` : ""
    return `${main} (client: ${day}${formatClock(at, clientZone)} ${zoneAbbr(clientZone, at)})`
}

/**
 * A short meeting time for lists: "Today, 1:30 PM IST", "Tomorrow, 9:00 AM GST",
 * "Wed, 1:30 PM IST", "19 Nov, 1:30 PM IST".
 */
export function formatMeetingShort(at: Date, zone: string, now: Date = new Date()): string {
    const diff = daysBetweenKeys(dateKeyInZone(now, zone), dateKeyInZone(at, zone))
    const clock = `${formatClock(at, zone)} ${zoneAbbr(zone, at)}`
    if (diff === 0) return `Today, ${clock}`
    if (diff === 1) return `Tomorrow, ${clock}`
    if (diff === -1) return `Yesterday, ${clock}`
    if (diff > 1 && diff < 7) return `${formatWeekdayShort(at, zone)}, ${clock}`
    return `${formatDayMonth(at, zone, now)}, ${clock}`
}
