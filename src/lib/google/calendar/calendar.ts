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

const GOOGLE_TIMEOUT_MS = 10_000

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
        // A request that hangs fails after this long, instead of holding the
        // API call until Vercel stops the function halfway through its work.
        timeout: GOOGLE_TIMEOUT_MS,
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

/** Length of a meeting made in the CRM. Booking-page meetings set their own. */
export const DEFAULT_MEETING_MINUTES = 60

// A private property on every event the CRM makes, holding the meeting's id.
// It lets the CRM find its event again even when the event id was not saved.
const CRM_MEETING_KEY = "crmMeetingId"

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
    const end = new Date(start.getTime() + (input.durationMinutes ?? DEFAULT_MEETING_MINUTES) * 60_000)
    // The zone only decides how Google writes the time in the invite. The
    // moment itself is the UTC instant above. The CRM passes the client's
    // zone, so the client's invite shows the client's own clock time.
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
        ...(input.requestId
            ? { extendedProperties: { private: { [CRM_MEETING_KEY]: input.requestId } } }
            : {}),
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
    /** Leave out to keep the event's current length. */
    durationMinutes?: number
    timeZone?: string
    sendUpdates?: "all" | "externalOnly" | "none"
    /** Tags an older event with its meeting id, so it is found directly next time. */
    crmMeetingId?: string
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

    // Keep the event's own length. A CRM meeting is 60 minutes and a
    // booking-page meeting 30. This used to reset every event to 30.
    let durationMs = (input.durationMinutes ?? 0) * 60_000
    if (durationMs <= 0) {
        const current = await cal.events.get({
            calendarId: getCalendarId(),
            eventId: input.googleEventId,
            fields: "status,start,end",
        })
        // Deleted in Google itself. A patch would move a cancelled event and
        // tell nobody, so report it as gone instead.
        if (current.data.status === "cancelled") {
            throw Object.assign(
                new Error("[google-calendar] The event was deleted in Google Calendar"),
                { status: 410 }
            )
        }
        const s = current.data.start?.dateTime
        const e = current.data.end?.dateTime
        durationMs = s && e ? new Date(e).getTime() - new Date(s).getTime() : 0
        if (!(durationMs > 0)) durationMs = DEFAULT_MEETING_MINUTES * 60_000
    }
    const end = new Date(start.getTime() + durationMs)
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
            ...(input.crmMeetingId
                ? { extendedProperties: { private: { [CRM_MEETING_KEY]: input.crmMeetingId } } }
                : {}),
        },
    })

    return mapEventResult(res.data)
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/**
 * Deletes the event. With sendUpdates "all", Google emails every guest that
 * the meeting is cancelled and takes it off their calendars.
 *
 * An event that is already gone counts as cancelled, so a second try after a
 * timeout does not fail.
 */
export async function cancelMeetEvent(
    googleEventId: string,
    sendUpdates: "all" | "externalOnly" | "none" = "all"
): Promise<"cancelled" | "already-gone"> {
    const cal = getCalendarClient()
    try {
        await cal.events.delete({
            calendarId: getCalendarId(),
            eventId: googleEventId,
            sendUpdates,
        })
        return "cancelled"
    } catch (err) {
        if (isGoogleGoneError(err)) return "already-gone"
        throw err
    }
}

// ---------------------------------------------------------------------------
// Find the event of a meeting
// ---------------------------------------------------------------------------

export interface FindMeetEventInput {
    /** The CRM meeting's id. It is also the Meet request id it was made with. */
    crmMeetingId: string
    /** The meeting title, which is the event summary. */
    title?: string
    /** Times the event may start at. Checked in order. */
    starts: Date[]
}

/**
 * Finds the Google event of a CRM meeting, or returns null.
 *
 * Until 19 Nov 2026 the meetings route saved the event id under a field the
 * model did not have, so Mongoose dropped it, and older meetings have no id.
 * This finds their events another way:
 *
 * 1. Events made since then carry the meeting id as a private property.
 * 2. Older events were made with the meeting id as their Meet request id.
 *    They are looked up by start time and matched on that id, or on the title
 *    when exactly one event at that time has it.
 */
export async function findMeetEventId(input: FindMeetEventInput): Promise<string | null> {
    const cal = getCalendarClient()
    const calendarId = getCalendarId()

    const tagged = await cal.events.list({
        calendarId,
        privateExtendedProperty: [`${CRM_MEETING_KEY}=${input.crmMeetingId}`],
        showDeleted: false,
        maxResults: 5,
        fields: "items(id,status)",
    })
    const hit = (tagged.data.items ?? []).find((e) => e.id && e.status !== "cancelled")
    if (hit?.id) return hit.id

    for (const at of input.starts) {
        if (Number.isNaN(at.getTime())) continue
        // Events that are running during the first minute after `at`. The
        // exact start is compared below.
        const res = await cal.events.list({
            calendarId,
            timeMin: at.toISOString(),
            timeMax: new Date(at.getTime() + 60_000).toISOString(),
            singleEvents: true,
            showDeleted: false,
            maxResults: 50,
            fields: "items(id,status,summary,start,conferenceData(createRequest(requestId)))",
        })
        const items = (res.data.items ?? []).filter(
            (e) =>
                e.id &&
                e.status !== "cancelled" &&
                e.start?.dateTime &&
                new Date(e.start.dateTime).getTime() === at.getTime()
        )

        const byRequest = items.find(
            (e) => e.conferenceData?.createRequest?.requestId === input.crmMeetingId
        )
        if (byRequest?.id) return byRequest.id

        const byTitle = input.title ? items.filter((e) => e.summary === input.title) : []
        if (byTitle.length === 1 && byTitle[0].id) return byTitle[0].id
    }

    return null
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

/** The HTTP status of a Google API error, when it has one. */
export function googleErrorStatus(err: unknown): number | undefined {
    const e = err as { status?: number; code?: number | string; response?: { status?: number } }
    const status = e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : undefined)
    return typeof status === "number" ? status : undefined
}

/** True when Google says the event does not exist (404) or was deleted (410). */
export function isGoogleGoneError(err: unknown): boolean {
    const status = googleErrorStatus(err)
    return status === 404 || status === 410
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