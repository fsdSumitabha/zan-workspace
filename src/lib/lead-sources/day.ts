/**
 * Calendar days for lead sources, as "YYYY-MM-DD" text.
 *
 * A lead source is allotted to a day, not to a moment. Text has no time zone,
 * so "2026-09-24" is the same day for an IN user and a US user. Text in this
 * shape also sorts and compares correctly in MongoDB.
 *
 * "Today" is always the person's own local day. The browser works it out and
 * sends it with each request. The server only checks it is plausible.
 *
 * Safe to import on the client.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function pad(n: number): string {
    return String(n).padStart(2, "0")
}

/** The local calendar day of a moment. */
export function toDayString(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today, in the local time zone of whoever runs this. */
export function todayString(): string {
    return toDayString(new Date())
}

/** True for a real calendar day in "YYYY-MM-DD" form. "2026-02-30" is false. */
export function isDayString(value: unknown): value is string {
    if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false
    const [y, m, d] = value.split("-").map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return (
        date.getUTCFullYear() === y &&
        date.getUTCMonth() === m - 1 &&
        date.getUTCDate() === d
    )
}

/** Local midnight of a day string. */
export function dayToLocalDate(day: string): Date {
    const [y, m, d] = day.split("-").map(Number)
    return new Date(y, m - 1, d)
}

export function addDays(day: string, amount: number): string {
    const [y, m, d] = day.split("-").map(Number)
    const date = new Date(Date.UTC(y, m - 1, d + amount))
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
    const [fy, fm, fd] = from.split("-").map(Number)
    const [ty, tm, td] = to.split("-").map(Number)
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * A short name for a day: "Today", "Tomorrow", "Yesterday", "Mon 28 Sep",
 * or "28 Sep 2025" when the year differs.
 */
export function formatDay(day: string, today: string = todayString()): string {
    const diff = daysBetween(today, day)
    if (diff === 0) return "Today"
    if (diff === 1) return "Tomorrow"
    if (diff === -1) return "Yesterday"

    const [y, m, d] = day.split("-").map(Number)
    const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    const [ty] = today.split("-").map(Number)

    if (y !== ty) return `${d} ${MONTH[m - 1]} ${y}`
    if (Math.abs(diff) < 7) return `${weekday} ${d} ${MONTH[m - 1]}`
    return `${d} ${MONTH[m - 1]}`
}

/** Today in UTC. The server's fallback when a request does not say. */
export function utcTodayString(): string {
    const now = new Date()
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
}

/**
 * The caller's "today", as sent by the browser.
 *
 * Every time zone is within one day of UTC, so a real local day is always
 * yesterday, today or tomorrow in UTC terms. Anything else is a wrong clock
 * or a forged value, and the UTC day is used instead.
 */
export function resolveClientToday(raw: unknown): string {
    const utc = utcTodayString()
    if (!isDayString(raw)) return utc
    return Math.abs(daysBetween(utc, raw)) <= 1 ? raw : utc
}
