import { OAuth2Client } from "google-auth-library"
import { calendar, calendar_v3 } from "@googleapis/calendar"
import { randomUUID } from "node:crypto"

// ---------------------------------------------------------------------------
// Env handling
// ---------------------------------------------------------------------------

function getEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`[google-calendar] Missing required env var: ${name}`)
    }
    return value
}

/**
 * Returns true only if all four Google envs are present, so callers can decide
 * to skip the Google call gracefully instead of throwing.
 */
export function isGoogleCalendarConfigured(): boolean {
    return Boolean(
        process.env.GOOGLE_CALENDAR_CLIENT_ID &&
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
        process.env.GOOGLE_CALENDAR_REFRESH_TOKEN &&
        process.env.GOOGLE_CALENDAR_REDIRECT_URI
    )
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------
// Built once per server process and reused. The OAuth2 client automatically
// exchanges the refresh token for short-lived access tokens and refreshes them
// as needed — you never manage access tokens yourself.

let cachedClient: calendar_v3.Calendar | null = null

function getCalendarClient(): calendar_v3.Calendar {
    if (cachedClient) return cachedClient

    const oauth2 = new OAuth2Client({
        clientId: getEnv("GOOGLE_CALENDAR_CLIENT_ID"),
        clientSecret: getEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
        redirectUri: getEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    })

    oauth2.setCredentials({
        refresh_token: getEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
    })

    cachedClient = calendar({
        version: "v3",
        auth: oauth2 as unknown as calendar_v3.Options["auth"],
    })
    return cachedClient
}

// Which calendar to write to, and the timezone used for display/recurrence.
// Override via env if the events should live on a non-primary calendar.
function getCalendarId(): string {
    return process.env.GOOGLE_CALENDAR_ID || "primary"
}
export function getDefaultTimeZone(): string {
    return process.env.GOOGLE_CALENDAR_TIMEZONE || "Asia/Kolkata"
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateMeetEventInput {
    /** Google event Title. Map your CRM `title` here. */
    summary: string
    /** Google event Description. Map your CRM `description` here. (`agenda` stays in your DB.) */
    description?: string | null
    /** Start time as an ISO string (your stored `scheduledAt`). */
    startISO: string
    /** Meeting length in minutes. Defaults to 60. */
    durationMinutes?: number
    /** Email addresses to invite. Empty array is fine — a Meet link is still created. */
    attendeeEmails?: string[]
    /**
     * Unique idempotency string for the Meet conference. Pass your freshly minted
     * Mongo `_id` (as a string) so the CRM record and the Google conference share
     * one traceable id. Falls back to a random UUID if omitted.
     */
    requestId?: string
    /** Whether Google emails the attendees. Defaults to "all". */
    sendUpdates?: "all" | "externalOnly" | "none"
    /** Override the default timezone for this event. */
    timeZone?: string
}

export interface MeetEventResult {
    /** Google's own event id — STORE THIS to reschedule/cancel later. */
    googleEventId: string
    /** The Google Meet join URL, or null if Google did not return one. */
    meetingLink: string | null
    /** Link to open the event in the Google Calendar UI. */
    htmlLink: string | null
    /** Conference creation status: "success" | "pending" | "failure" | null. */
    conferenceStatus: string | null
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a Google Calendar event with a brand-new Google Meet conference and
 * returns the join link + Google's event id.
 *
 * Throws on auth/network/API failure — the caller decides whether that should
 * block the CRM meeting from being saved.
 */
export async function createMeetEvent(
    input: CreateMeetEventInput
): Promise<MeetEventResult> {
    const cal = getCalendarClient()

    const start = new Date(input.startISO)
    if (Number.isNaN(start.getTime())) {
        throw new Error(
            `[google-calendar] Invalid startISO: ${String(input.startISO)}`
        )
    }

    // Defaults to 1 hour, which is what CRM-scheduled meetings have always used.
    const end = new Date(start.getTime() + (input.durationMinutes ?? 60) * 60_000)
    const timeZone = input.timeZone ?? getDefaultTimeZone()

    const requestBody: calendar_v3.Schema$Event = {
        summary: input.summary,
        description: input.description ?? undefined,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
        attendees: (input.attendeeEmails ?? [])
            .filter((email) => Boolean(email))
            .map((email) => ({ email })),
        conferenceData: {
            createRequest: {
                requestId: input.requestId ?? randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
            },
        },
    }

    const res = await cal.events.insert({
        calendarId: getCalendarId(),
        conferenceDataVersion: 1, // REQUIRED — without this Google drops the Meet link
        sendUpdates: input.sendUpdates ?? "all",
        requestBody,
    })

    return mapEventResult(res.data)
}

// ---------------------------------------------------------------------------
// Reschedule (move start/end) — for your rescheduleHistory flow
// ---------------------------------------------------------------------------

export interface RescheduleInput {
    googleEventId: string
    startISO: string
    durationMinutes?: number
    timeZone?: string
    sendUpdates?: "all" | "externalOnly" | "none"
}

export async function rescheduleMeetEvent(
    input: RescheduleInput
): Promise<MeetEventResult> {
    const cal = getCalendarClient()

    const start = new Date(input.startISO)
    if (Number.isNaN(start.getTime())) {
        throw new Error(
            `[google-calendar] Invalid startISO: ${String(input.startISO)}`
        )
    }
    const durationMinutes = input.durationMinutes ?? 30
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    const timeZone = input.timeZone ?? getDefaultTimeZone()

    // PATCH only touches the fields we send; the existing Meet link is preserved.
    const res = await cal.events.patch({
        calendarId: getCalendarId(),
        eventId: input.googleEventId,
        conferenceDataVersion: 1,
        sendUpdates: input.sendUpdates ?? "all",
        requestBody: {
            start: { dateTime: start.toISOString(), timeZone },
            end: { dateTime: end.toISOString(), timeZone },
        },
    })

    return mapEventResult(res.data)
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelMeetEvent(
    googleEventId: string,
    sendUpdates: "all" | "externalOnly" | "none" = "all"
): Promise<void> {
    const cal = getCalendarClient()
    await cal.events.delete({
        calendarId: getCalendarId(),
        eventId: googleEventId,
        sendUpdates,
    })
}

// ---------------------------------------------------------------------------
// Free/busy — used by the public booking page
// ---------------------------------------------------------------------------

export interface BusyInterval {
    start: Date
    end: Date
}

/**
 * Returns the busy blocks on the configured calendar between two instants.
 * Only time ranges are exposed by Google here — never event titles/details —
 * so the result is safe to derive public availability from.
 */
export async function getBusyIntervals(
    timeMin: Date,
    timeMax: Date
): Promise<BusyInterval[]> {
    try {
        return await getBusyIntervalsViaFreeBusy(timeMin, timeMax)
    } catch (err) {
        // FreeBusy needs the calendar.freebusy / calendar.readonly / calendar
        // scope. A token granted only `calendar.events` gets a 403 here, but can
        // still list events — derive busy blocks from those instead.
        if (!isInsufficientScopeError(err)) throw err
        return getBusyIntervalsViaEvents(timeMin, timeMax)
    }
}

async function getBusyIntervalsViaFreeBusy(
    timeMin: Date,
    timeMax: Date
): Promise<BusyInterval[]> {
    const cal = getCalendarClient()
    const calendarId = getCalendarId()

    const res = await cal.freebusy.query({
        requestBody: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            timeZone: getDefaultTimeZone(),
            items: [{ id: calendarId }],
        },
    })

    const calendars = res.data.calendars ?? {}
    const entry = calendars[calendarId] ?? Object.values(calendars)[0]

    if (!entry) {
        throw new Error("[google-calendar] freebusy returned no calendar entry")
    }
    if (entry.errors?.length) {
        throw new Error(
            `[google-calendar] freebusy error: ${entry.errors
                .map((e) => e.reason)
                .join(", ")}`
        )
    }

    return (entry.busy ?? []).flatMap((b) =>
        b.start && b.end
            ? [{ start: new Date(b.start), end: new Date(b.end) }]
            : []
    )
}

async function getBusyIntervalsViaEvents(
    timeMin: Date,
    timeMax: Date
): Promise<BusyInterval[]> {
    const cal = getCalendarClient()
    const busy: BusyInterval[] = []
    let pageToken: string | undefined

    do {
        const res = await cal.events.list({
            calendarId: getCalendarId(),
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true, // expand recurring events into instances
            showDeleted: false,
            maxResults: 2500,
            fields: "nextPageToken,items(status,transparency,start,end,attendees(self,responseStatus))",
            pageToken,
        })

        for (const ev of res.data.items ?? []) {
            if (ev.status === "cancelled") continue
            if (ev.transparency === "transparent") continue // marked "Free"
            const self = ev.attendees?.find((a) => a.self)
            if (self?.responseStatus === "declined") continue

            // Timed events use dateTime; all-day events use date (end is exclusive).
            const tz = getDefaultTimeZone()
            const start = ev.start?.dateTime
                ? new Date(ev.start.dateTime)
                : ev.start?.date
                  ? zonedMidnight(ev.start.date, tz)
                  : null
            const end = ev.end?.dateTime
                ? new Date(ev.end.dateTime)
                : ev.end?.date
                  ? zonedMidnight(ev.end.date, tz)
                  : null
            if (start && end) busy.push({ start, end })
        }

        pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    return busy
}

/** Midnight of a "YYYY-MM-DD" date in `timeZone`, as a UTC instant. */
function zonedMidnight(dateKey: string, timeZone: string): Date {
    const [y, m, d] = dateKey.split("-").map(Number)
    const guess = Date.UTC(y, m - 1, d)
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
    }).formatToParts(new Date(guess))
    const get = (t: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"))
    return new Date(guess - (asUtc - guess))
}

function isInsufficientScopeError(err: unknown): boolean {
    const e = err as {
        status?: number
        message?: string
        response?: { status?: number }
    }
    const status = e?.response?.status ?? e?.status
    return (
        status === 403 &&
        Boolean(e?.message?.toLowerCase().includes("insufficient authentication scopes"))
    )
}

/**
 * True when Google rejected the stored refresh token (expired, revoked, or
 * invalidated by an account password change). The fix is to re-run the OAuth
 * consent flow and replace GOOGLE_CALENDAR_REFRESH_TOKEN.
 */
export function isGoogleAuthError(err: unknown): boolean {
    const e = err as {
        message?: string
        response?: { data?: { error?: string } }
    }
    return (
        e?.response?.data?.error === "invalid_grant" ||
        Boolean(e?.message?.includes("invalid_grant"))
    )
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function mapEventResult(data: calendar_v3.Schema$Event): MeetEventResult {
    const videoEntry = data.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === "video"
    )

    return {
        googleEventId: data.id ?? "",
        meetingLink: data.hangoutLink ?? videoEntry?.uri ?? null,
        htmlLink: data.htmlLink ?? null,
        conferenceStatus:
            data.conferenceData?.createRequest?.status?.statusCode ?? null,
    }
}