// Time zone helpers. Safe on the server and in the browser.
//
// The CRM's time rules. docs/time-zones.md has the long version.
//
// 1. A moment is saved once, in UTC: a Date, or an ISO string that ends in "Z".
// 2. Code never uses the computer's own zone. The server on Vercel runs in UTC,
//    and a team member's laptop can be anywhere. Every function here takes the
//    zone it must use.
// 3. A clock time on screen or in a message carries its zone name: "1:30 PM IST".
//
// Zones are IANA names such as "Asia/Kolkata". Intl does the zone maths, so
// summer time in the US and the UK needs no date library.
//
// The text is built here from numbers, not by Intl's own formats. Intl output
// differs between Node, Chrome and Safari (for example a narrow no-break space
// before "PM"), and the bell, the push and the screen must show the same words.

import { DEFAULT_REGION, REGIONS, parseRegionCode } from "@/lib/region"

/** The zone used when nothing better is known: India's. */
export const DEFAULT_TIME_ZONE = REGIONS[DEFAULT_REGION].timeZone

export interface ZoneChoice {
    zone: string
    /** Where the zone is, as people say it: "Dubai". */
    place: string
    /** A second name for the picker: "US Eastern". */
    hint?: string
}

/**
 * The zones the meeting form offers for a client. The three region zones come
 * first. A zone that is not in this list still works everywhere. It is only
 * not offered in the picker.
 */
export const ZONE_CHOICES: readonly ZoneChoice[] = [
    { zone: "Asia/Kolkata", place: "India" },
    { zone: "Asia/Dubai", place: "Dubai", hint: "UAE" },
    { zone: "America/New_York", place: "New York", hint: "US Eastern" },
    { zone: "America/Chicago", place: "Chicago", hint: "US Central" },
    { zone: "America/Denver", place: "Denver", hint: "US Mountain" },
    { zone: "America/Phoenix", place: "Phoenix", hint: "Arizona" },
    { zone: "America/Los_Angeles", place: "Los Angeles", hint: "US Pacific" },
    { zone: "Europe/London", place: "London", hint: "UK" },
    { zone: "Asia/Singapore", place: "Singapore" },
    { zone: "Australia/Sydney", place: "Sydney", hint: "Australia" },
]

// Chrome reports India as "Asia/Calcutta" and Firefox as "Asia/Kolkata". They
// are the same zone. Names are made canonical before they are saved or shown,
// so one zone never looks like two.
const ALIASES: Record<string, string> = {
    "Asia/Calcutta": "Asia/Kolkata",
    "US/Eastern": "America/New_York",
    "US/Central": "America/Chicago",
    "US/Mountain": "America/Denver",
    "US/Arizona": "America/Phoenix",
    "US/Pacific": "America/Los_Angeles",
    "Etc/UTC": "UTC",
    "Etc/GMT": "UTC",
    "GMT": "UTC",
}

// Only valid names are remembered. The name can come from a cookie or a
// header, so remembering every invalid one would let a client fill memory.
const validZones = new Set<string>()

/** True when `tz` is a zone name this runtime knows. */
export function isValidTimeZone(tz: unknown): tz is string {
    if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false
    if (validZones.has(tz)) return true
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz })
    } catch {
        return false
    }
    validZones.add(tz)
    return true
}

/** The canonical zone name, or null when `tz` is not a zone. */
export function normalizeTimeZone(tz: unknown): string | null {
    if (typeof tz !== "string") return null
    const trimmed = tz.trim()
    const name = ALIASES[trimmed] ?? trimmed
    return isValidTimeZone(name) ? name : null
}

// Every public function below goes through this, so a bad name falls back to
// India instead of throwing a RangeError in the middle of a page.
function safeZone(tz: string | null | undefined): string {
    return normalizeTimeZone(tz) ?? DEFAULT_TIME_ZONE
}

/** The zone of a sales region: IN → Asia/Kolkata, AE → Asia/Dubai, US → America/New_York. */
export function zoneForRegion(region?: string | null): string {
    return REGIONS[parseRegionCode(region)].timeZone
}

/**
 * The zone of the browser this runs in. Call it in the browser only. On the
 * server it returns the server's zone, which is UTC on Vercel and is never
 * the right answer.
 */
export function getBrowserTimeZone(): string {
    try {
        return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? DEFAULT_TIME_ZONE
    } catch {
        return DEFAULT_TIME_ZONE
    }
}

// ---------------------------------------------------------------------------
// Clock parts
// ---------------------------------------------------------------------------

export interface ZonedParts {
    year: number
    month: number // 1 to 12
    day: number
    hour: number // 0 to 23
    minute: number
    second: number
    weekday: number // 0 is Sunday
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

/** What a clock in `timeZone` shows at `date`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
    const zone = safeZone(timeZone)
    let fmt = partsFormatters.get(zone)
    if (!fmt) {
        fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            hourCycle: "h23",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        })
        partsFormatters.set(zone, fmt)
    }
    const parts = fmt.formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value)
    const year = get("year")
    const month = get("month")
    const day = get("day")
    return {
        year,
        month,
        day,
        hour: get("hour") % 24,
        minute: get("minute"),
        second: get("second"),
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    }
}

/** How far `timeZone` is ahead of UTC at `date`, in minutes. India is 330. */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
    const p = getZonedParts(date, timeZone)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000)
}

/** "UTC+5:30", "UTC-5", "UTC". */
export function formatOffset(minutes: number): string {
    if (minutes === 0) return "UTC"
    const sign = minutes > 0 ? "+" : "-"
    const abs = Math.abs(minutes)
    const h = Math.floor(abs / 60)
    const m = abs % 60
    return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`
}

/** True when two zones show the same clock time at `date`. */
export function sameClock(date: Date, zoneA: string, zoneB: string): boolean {
    return zoneOffsetMinutes(date, zoneA) === zoneOffsetMinutes(date, zoneB)
}

// ---------------------------------------------------------------------------
// Clock time ↔ moment
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0")

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Reads a clock time such as "2026-11-19T13:30" (the value of a
 * datetime-local input) as a time in `timeZone`, and returns that moment.
 * Returns null for anything else, and for dates that do not exist.
 *
 * "2026-11-19T13:30" in Asia/Kolkata is 08:00 UTC. In Asia/Dubai it is 09:30 UTC.
 */
export function wallTimeToUtc(wall: string, timeZone: string): Date | null {
    const m = WALL_RE.exec(wall.trim())
    if (!m) return null
    const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number)
    const second = Number(m[6] ?? 0)
    if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null

    const guess = Date.UTC(year, month - 1, day, hour, minute, second)
    const check = new Date(guess)
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null // 31 Feb

    const zone = safeZone(timeZone)
    const first = zoneOffsetMinutes(new Date(guess), zone)
    let result = guess - first * 60_000
    // A second pass fixes the rare time that sits next to a summer time change.
    const second2 = zoneOffsetMinutes(new Date(result), zone)
    if (second2 !== first) result = guess - second2 * 60_000
    return new Date(result)
}

/** The clock time in `timeZone` at `date`, as "2026-11-19T13:30", for a datetime-local input. */
export function utcToWallTime(date: Date, timeZone: string): string {
    const p = getZonedParts(date, timeZone)
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** The calendar date in `timeZone` at `date`, as "2026-11-19". */
export function dateKeyInZone(date: Date, timeZone: string): string {
    const p = getZonedParts(date, timeZone)
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** True for a "YYYY-MM-DD" string. */
export function isDateKey(value: unknown): value is string {
    return typeof value === "string" && DATE_KEY_RE.test(value)
}

/** "2026-11-19" plus `days` days. */
export function addDaysToKey(dateKey: string, days: number): string {
    const m = DATE_KEY_RE.exec(dateKey)
    if (!m) return dateKey
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Days from one "YYYY-MM-DD" to another. Tomorrow is 1. */
export function daysBetweenKeys(from: string, to: string): number {
    const a = DATE_KEY_RE.exec(from)
    const b = DATE_KEY_RE.exec(to)
    if (!a || !b) return 0
    const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
    const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
    return Math.round((tb - ta) / 86_400_000)
}

/**
 * The moments a calendar day starts and ends in `timeZone`. `end` is the
 * start of the next day, so filter with `$gte: start, $lt: end`.
 *
 * 19 Nov in India runs from 18 Nov 18:30 UTC to 19 Nov 18:30 UTC.
 */
export function dayRangeInZone(dateKey: string, timeZone: string): { start: Date; end: Date } | null {
    if (!isDateKey(dateKey)) return null
    const start = wallTimeToUtc(`${dateKey}T00:00`, timeZone)
    const end = wallTimeToUtc(`${addDaysToKey(dateKey, 1)}T00:00`, timeZone)
    return start && end ? { start, end } : null
}

/**
 * The `createdAt` filter for a "From / To" date picker. Both values are
 * "YYYY-MM-DD" days in `timeZone`, and To includes its whole day. A value in
 * any other form is read as a plain date, as the lists did before.
 */
export function dateKeyRangeFilter(
    from: string | null | undefined,
    to: string | null | undefined,
    timeZone: string
): { $gte?: Date; $lt?: Date } | null {
    const filter: { $gte?: Date; $lt?: Date } = {}
    if (from) {
        const range = dayRangeInZone(from, timeZone)
        const start = range?.start ?? new Date(from)
        if (!isNaN(start.getTime())) filter.$gte = start
    }
    if (to) {
        let end = dayRangeInZone(to, timeZone)?.end
        if (!end) {
            const t = new Date(to)
            if (!isNaN(t.getTime())) end = new Date(t.getTime() + 86_400_000)
        }
        if (end) filter.$lt = end
    }
    return Object.keys(filter).length > 0 ? filter : null
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// The names people use. Intl in English gives "GMT+5:30" for India and
// "GMT+4" for Dubai, which nobody says. US, UK and Australian zones get
// EST/EDT, PST/PDT, GMT/BST and AEST/AEDT from Intl, which follows summer time.
const ABBREVIATIONS: Record<string, string> = {
    "Asia/Kolkata": "IST",
    "Asia/Dubai": "GST",
    "Asia/Muscat": "GST",
    "Asia/Singapore": "SGT",
    "UTC": "UTC",
}

const abbrFormatters = new Map<string, Intl.DateTimeFormat>()

function intlAbbreviation(zone: string, at: Date): string | undefined {
    const locale = zone.startsWith("America/")
        ? "en-US"
        : zone.startsWith("Europe/")
          ? "en-GB"
          : zone.startsWith("Australia/")
            ? "en-AU"
            : "en-US"
    const key = `${locale}|${zone}`
    let fmt = abbrFormatters.get(key)
    if (!fmt) {
        fmt = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" })
        abbrFormatters.set(key, fmt)
    }
    return fmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value
}

/**
 * The short zone name at `at`: "IST", "GST", "EST" or "EDT". A zone with no
 * common short name gets its offset, such as "UTC+5:45".
 */
export function zoneAbbr(timeZone: string, at: Date = new Date()): string {
    const zone = safeZone(timeZone)
    const fixed = ABBREVIATIONS[zone]
    if (fixed) return fixed
    const name = intlAbbreviation(zone, at)
    if (name && /^[A-Z]{2,5}$/.test(name)) return name
    return formatOffset(zoneOffsetMinutes(at, zone))
}

/** Where a zone is, as people say it: "India", "Dubai", "New York". */
export function zonePlace(timeZone: string): string {
    const zone = safeZone(timeZone)
    const known = ZONE_CHOICES.find((c) => c.zone === zone)
    if (known) return known.place
    const last = zone.split("/").pop() ?? zone
    return last.replace(/_/g, " ")
}

/** A zone for a picker: "Dubai (UAE) · GST · UTC+4". */
export function describeZone(timeZone: string, at: Date = new Date()): string {
    const zone = safeZone(timeZone)
    const known = ZONE_CHOICES.find((c) => c.zone === zone)
    const place = known ? `${known.place}${known.hint ? ` (${known.hint})` : ""}` : zonePlace(zone)
    const abbr = zoneAbbr(zone, at)
    const offset = formatOffset(zoneOffsetMinutes(at, zone))
    return abbr === offset ? `${place} · ${offset}` : `${place} · ${abbr} · ${offset}`
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "1:30 PM" in `timeZone`. */
export function formatClock(date: Date, timeZone: string): string {
    const p = getZonedParts(date, timeZone)
    const h12 = p.hour % 12 || 12
    return `${h12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`
}

/** "1:30 PM IST" in `timeZone`. */
export function formatClockWithZone(date: Date, timeZone: string): string {
    return `${formatClock(date, timeZone)} ${zoneAbbr(timeZone, date)}`
}

/**
 * "Wed, 19 Nov" in `timeZone`. The year is added when it is not the current
 * year there, or when `year` is true.
 */
export function formatDay(date: Date, timeZone: string, opts: { year?: boolean; now?: Date } = {}): string {
    const p = getZonedParts(date, timeZone)
    const nowYear = getZonedParts(opts.now ?? new Date(), timeZone).year
    const showYear = opts.year || p.year !== nowYear
    return `${WEEKDAYS_SHORT[p.weekday]}, ${p.day} ${MONTHS_SHORT[p.month - 1]}${showYear ? ` ${p.year}` : ""}`
}

/** "Wed" in `timeZone`. */
export function formatWeekdayShort(date: Date, timeZone: string): string {
    return WEEKDAYS_SHORT[getZonedParts(date, timeZone).weekday]
}

/** "Wednesday" in `timeZone`. */
export function formatWeekdayLong(date: Date, timeZone: string): string {
    return WEEKDAYS_LONG[getZonedParts(date, timeZone).weekday]
}

/** "19 Nov", or "19 Nov 2027" in another year, in `timeZone`. */
export function formatDayMonth(date: Date, timeZone: string, now: Date = new Date()): string {
    const p = getZonedParts(date, timeZone)
    const nowYear = getZonedParts(now, timeZone).year
    return `${p.day} ${MONTHS_SHORT[p.month - 1]}${p.year !== nowYear ? ` ${p.year}` : ""}`
}

/** "Wed, 19 Nov · 1:30 PM IST" in `timeZone`. */
export function formatMoment(date: Date, timeZone: string, opts: { year?: boolean; now?: Date } = {}): string {
    return `${formatDay(date, timeZone, opts)} · ${formatClockWithZone(date, timeZone)}`
}
