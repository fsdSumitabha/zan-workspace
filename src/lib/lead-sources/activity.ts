import { Types } from "mongoose"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import type { LeadSourceActivityType } from "@/constants/leadSourceStatus"
import { isDayString } from "./day"
import { LeadSourceError } from "./http"

/** One entry for the `activity` array of a lead source. */
export function activityEntry(
    user: AuthUser,
    type: LeadSourceActivityType,
    fields: {
        text?: string
        from?: unknown
        to?: unknown
        callbackAt?: Date | null
    } = {},
    at: Date = new Date()
) {
    return {
        _id: new Types.ObjectId(),
        type,
        ...(fields.text ? { text: fields.text } : {}),
        ...(fields.from !== undefined ? { from: fields.from } : {}),
        ...(fields.to !== undefined ? { to: fields.to } : {}),
        ...(fields.callbackAt !== undefined ? { callbackAt: fields.callbackAt } : {}),
        by: new Types.ObjectId(user.id),
        byName: user.name || user.email || "",
        at,
    }
}

export const NOTE_MAX_LENGTH = 2000

/** An optional note: trimmed text, or undefined when empty. */
export function parseNote(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) return undefined
    if (typeof raw !== "string") throw new LeadSourceError("The note must be text.", 400, { field: "note" })

    const text = raw.trim()
    if (!text) return undefined

    if (text.length > NOTE_MAX_LENGTH) {
        throw new LeadSourceError(
            `The note is too long. Keep it under ${NOTE_MAX_LENGTH} characters.`,
            400,
            { field: "note" }
        )
    }
    return text
}

/** How far ahead a callback may be set. */
const CALLBACK_MAX_DAYS = 366

/**
 * A callback time from a request: an ISO time, and the local day it falls on
 * for the person who set it. The day is what moves the source to that day's
 * list, so it has to come from the browser, which knows the time zone.
 */
export function parseCallback(rawAt: unknown, rawDay: unknown): { at: Date; day: string } {
    const at = typeof rawAt === "string" ? new Date(rawAt) : null
    if (!at || Number.isNaN(at.getTime())) {
        throw new LeadSourceError("Pick a time for the callback.", 400, { field: "callbackAt" })
    }

    const now = Date.now()
    // A few minutes of slack for a slow clock or a slow click.
    if (at.getTime() < now - 10 * 60_000) {
        throw new LeadSourceError("The callback time has already passed. Pick a later time.", 400, { field: "callbackAt" })
    }
    if (at.getTime() > now + CALLBACK_MAX_DAYS * 86_400_000) {
        throw new LeadSourceError("Pick a callback time within the next year.", 400, { field: "callbackAt" })
    }

    // isDayString, not only the shape. "2026-02-30" has the right shape, and
    // Date.parse would quietly read it as 2 March.
    if (!isDayString(rawDay)) {
        throw new LeadSourceError("The callback day is missing or not a real day.", 400, { field: "callbackDay" })
    }

    // The local day of a moment is at most a day away from its UTC day.
    const utcDay = at.toISOString().slice(0, 10)
    const diff = Math.abs(Date.parse(`${rawDay}T00:00:00Z`) - Date.parse(`${utcDay}T00:00:00Z`))
    if (Number.isNaN(diff) || diff > 86_400_000) {
        throw new LeadSourceError("The callback day does not match the callback time.", 400, { field: "callbackDay" })
    }

    return { at, day: rawDay }
}
