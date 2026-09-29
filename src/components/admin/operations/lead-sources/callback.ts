import { toDayString, todayString, formatDay } from "@/lib/lead-sources/day"

/**
 * Callback times on the client: the quick choices, the payload the API
 * wants, and how a time reads on screen.
 */

export interface CallbackPreset {
    label: string
    at: () => Date
}

function inMinutes(minutes: number): () => Date {
    return () => {
        const d = new Date(Date.now() + minutes * 60_000)
        d.setSeconds(0, 0)
        return d
    }
}

function tomorrowAt(hour: number): () => Date {
    return () => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        d.setHours(hour, 0, 0, 0)
        return d
    }
}

export const CALLBACK_PRESETS: CallbackPreset[] = [
    { label: "15 min", at: inMinutes(15) },
    { label: "30 min", at: inMinutes(30) },
    { label: "1 hour", at: inMinutes(60) },
    { label: "2 hours", at: inMinutes(120) },
    { label: "4 hours", at: inMinutes(240) },
    { label: "Tomorrow 10 AM", at: tomorrowAt(10) },
]

/** The time and the local day the API needs to set a callback. */
export function callbackPayload(at: Date): { callbackAt: string; callbackDay: string } {
    return { callbackAt: at.toISOString(), callbackDay: toDayString(at) }
}

export type CallbackState = "due" | "soon" | "later"

/** How close a callback is. "soon" is within 15 minutes. */
export function callbackState(iso: string, now: number): CallbackState {
    const t = Date.parse(iso)
    if (t <= now) return "due"
    if (t - now <= 15 * 60_000) return "soon"
    return "later"
}

function clock(date: Date): string {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/** "3:00 PM" today, "Tomorrow 10:00 AM", "Mon 28 Sep 10:00 AM". */
export function formatCallback(iso: string): string {
    const date = new Date(iso)
    const day = toDayString(date)
    const today = todayString()
    return day === today ? clock(date) : `${formatDay(day, today)} ${clock(date)}`
}

/** "in 25 min", "in 3 h", "5 min ago", "2 h ago". */
export function relativeCallback(iso: string, now: number): string {
    const diff = Date.parse(iso) - now
    const minutes = Math.round(Math.abs(diff) / 60_000)

    let text: string
    if (minutes < 1) text = "now"
    else if (minutes < 60) text = `${minutes} min`
    else if (minutes < 60 * 24) text = `${Math.round(minutes / 60)} h`
    else text = `${Math.round(minutes / (60 * 24))} d`

    if (text === "now") return "due now"
    return diff > 0 ? `in ${text}` : `${text} ago`
}

/** A Date as the value of an <input type="datetime-local">. */
export function toDateTimeLocal(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
