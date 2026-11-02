import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { EVENT_TYPE, type EventType } from "@/constants/eventTypes"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"
import { REGIONS, getRegion, parseRegionCode } from "@/lib/region"
import type { NotificationActor, RenderedMessage } from "../../types/notification"

dayjs.extend(utc)
dayjs.extend(timezone)

// Android shows about 40 characters of a title on one line. The body gets one
// line, and up to about three when the notification is opened. Longer text is
// cut with "…" here, so the bell, Windows and Android all show the same words.
const TITLE_MAX = 60
const BODY_MAX = 80

// Sources that code sets. A lead added by hand keeps the source as typed.
const LEAD_SOURCE_LABEL: Record<string, string> = {
    "client-portal": "the website",
    "facebook": "Facebook",
    "booking-page": "the booking page",
    "Cold Call": "a cold call",
}

function leadUrl(id: string): string {
    return `/admin/operations/leads/${id}`
}
function clientUrl(id: string): string {
    return `/admin/operations/clients/${id}`
}
function projectUrl(id: string): string {
    return `/admin/operations/projects/${id}`
}

// "Robin Sharma" → "Robin". The name goes into the text when the notification
// is sent, so a later name change does not rewrite old notifications.
function firstName(actor: NotificationActor | null): string {
    return actor?.name?.trim().split(/\s+/)[0] || "Someone"
}

// The time is written in the meeting's region, not the server's. On Vercel the
// server runs in UTC, and an 11:30 AM meeting in India used to read "6:00 AM".
// Returns "tomorrow at 11:30 AM", lower case, to sit inside a sentence.
function fmtMeetingTime(d: string | Date | undefined, region?: string): string {
    if (!d) return ""
    const zone = region ? REGIONS[parseRegionCode(region)].timeZone : getRegion().timeZone
    const day = dayjs(d).tz(zone)
    const now = dayjs().tz(zone)
    // Compare the calendar dates in that zone: "today" is today there.
    const diff = dayjs(day.format("YYYY-MM-DD")).diff(dayjs(now.format("YYYY-MM-DD")), "day")
    const time = day.format("h:mm A")
    if (diff === 0) return `today at ${time}`
    if (diff === 1) return `tomorrow at ${time}`
    if (diff === -1) return `yesterday at ${time}`
    if (diff > 1 && diff < 7) return `${day.format("dddd")} at ${time}`
    return `${day.format("MMM D")} at ${time}`
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function statusLabel(metaMap: any, code: number | undefined): string | undefined {
    if (code === undefined || code === null) return undefined
    return metaMap?.[code]?.label
}

function clip(s: string, max: number): string {
    if (s.length <= max) return s
    return s.slice(0, max - 1).trimEnd() + "…"
}

// "Discussion → Negotiation". The new stage is also at the end of the title,
// where Android may cut it, so the body always shows it too.
function stageMove(from: string | undefined, to: string | undefined): string | undefined {
    if (from && to) return `${from} → ${to}`
    return to ? `Now ${to}` : undefined
}

// The body: the parts that have text, joined with " · ", cut to BODY_MAX.
function bodyLine(...parts: unknown[]): string | undefined {
    const text = parts
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean)
        .join(" · ")
    return text ? clip(text, BODY_MAX) : undefined
}

function parentUrlFromMeeting(meeting: any): string | undefined {
    // Not `!meeting.entityType`: a lead's code is 0.
    if (meeting?.entityType == null || !meeting?.entityId) return undefined
    const id = String(meeting.entityId)
    switch (meeting.entityType) {
        case 0: return leadUrl(id)
        case 1: return clientUrl(id)
        case 2: return projectUrl(id)
        default: return undefined
    }
}

/**
 * The title says who did what: "Robin added a lead: Arjun Mehta". It starts
 * with the first name of the team member who acted, so Android's one-line
 * title still shows who and what. The body carries the detail.
 */
export function renderMessage(
    type: EventType,
    payload: Record<string, any>,
    actor: NotificationActor | null,
): RenderedMessage {
    const by = firstName(actor)

    switch (type) {
        case 1000: { // LEAD_CREATED
            const name = payload.lead?.name ?? "Unnamed"
            const src = payload.lead?.source
            return {
                badge: "target",
                // No actor: the lead came in by itself, from the website, Facebook or the booking page.
                title: clip(actor ? `${by} added a lead: ${name}` : `New lead: ${name}`, TITLE_MAX),
                body: src ? `Came in via ${LEAD_SOURCE_LABEL[src] ?? src}` : undefined,
                url: leadUrl(String(payload.lead?._id ?? "")),
            }
        }
        case 1010: { // LEAD_CONVERTED
            const name = payload.lead?.name ?? payload.client?.name ?? "a lead"
            return {
                badge: "party-popper",
                title: clip(`${by} converted ${name} to a client`, TITLE_MAX),
                body: bodyLine(payload.client?.company),
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1020: { // LEAD_STATUS_CHANGED
            const name = payload.lead?.name ?? "a lead"
            const to = statusLabel(LEAD_STATUS_META, payload.newStatus)
            const from = statusLabel(LEAD_STATUS_META, payload.oldStatus)
            return {
                badge: "refresh-cw",
                title: clip(to ? `${by} moved ${name} to ${to}` : `${by} changed the stage of ${name}`, TITLE_MAX),
                body: bodyLine(stageMove(from, to), payload.remarks),
                url: leadUrl(String(payload.lead?._id ?? "")),
            }
        }
        case 1100: { // CLIENT_CREATED
            const name = payload.client?.name ?? "Unnamed"
            return {
                badge: "user-plus",
                title: clip(`${by} added a client: ${name}`, TITLE_MAX),
                body: bodyLine(payload.client?.company),
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1110: { // CLIENT_STATUS_CHANGED
            const name = payload.client?.name ?? "a client"
            const to = statusLabel(CLIENT_STATUS_META, payload.newStatus)
            const from = statusLabel(CLIENT_STATUS_META, payload.oldStatus)
            return {
                badge: "refresh-cw",
                title: clip(to ? `${by} moved ${name} to ${to}` : `${by} changed the status of ${name}`, TITLE_MAX),
                body: bodyLine(stageMove(from, to), payload.remarks),
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1200: { // PROJECT_CREATED
            const title = payload.project?.title ?? "Untitled"
            const client = payload.clientName
            return {
                badge: "folder-plus",
                title: clip(`${by} created a project: ${title}`, TITLE_MAX),
                body: bodyLine(client && `For ${client}`),
                url: projectUrl(String(payload.project?._id ?? "")),
            }
        }
        case 1210: { // PROJECT_STATUS_CHANGED
            const title = payload.project?.title ?? "a project"
            const to = statusLabel(PROJECT_STATUS_META, payload.newStatus)
            const from = statusLabel(PROJECT_STATUS_META, payload.oldStatus)
            return {
                badge: "refresh-cw",
                title: clip(to ? `${by} moved ${title} to ${to}` : `${by} changed the stage of ${title}`, TITLE_MAX),
                body: bodyLine(stageMove(from, to), payload.remarks),
                url: projectUrl(String(payload.project?._id ?? "")),
            }
        }
        case 2010: { // MEETING_SCHEDULED
            const who = payload.parentName ?? "a client"
            const when = fmtMeetingTime(payload.meeting?.scheduledAt, payload.meeting?.region)
            // A visitor on the booking page books it, not a team member.
            if (payload.source === "booking-page") {
                return {
                    badge: "calendar",
                    title: clip(`${who} booked a meeting`, TITLE_MAX),
                    body: bodyLine(when && capitalize(when), "via the booking page"),
                    url: parentUrlFromMeeting(payload.meeting),
                }
            }
            return {
                badge: "calendar",
                title: clip(`${by} scheduled a meeting with ${who}`, TITLE_MAX),
                body: bodyLine(when && capitalize(when)),
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2020: { // MEETING_RESCHEDULED
            const who = payload.parentName ?? "a client"
            const when = fmtMeetingTime(payload.meeting?.scheduledAt, payload.meeting?.region)
            return {
                badge: "calendar-clock",
                title: clip(`${by} rescheduled the meeting with ${who}`, TITLE_MAX),
                body: bodyLine(when && `Now ${when}`, payload.reason),
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2030: { // MEETING_CANCELLED
            const who = payload.parentName ?? "a client"
            const when = fmtMeetingTime(payload.meeting?.scheduledAt, payload.meeting?.region)
            return {
                badge: "calendar-x",
                title: clip(`${by} cancelled the meeting with ${who}`, TITLE_MAX),
                body: bodyLine(when && `Was set for ${when}`),
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2040: { // MEETING_MISSED
            const who = payload.parentName ?? "a client"
            const when = fmtMeetingTime(payload.meeting?.scheduledAt, payload.meeting?.region)
            return {
                badge: "calendar-x",
                title: clip(`${by} marked a missed meeting with ${who}`, TITLE_MAX),
                body: bodyLine(when && `Was set for ${when}`),
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2050: { // MEETING_COMPLETED
            const who = payload.parentName ?? "a client"
            return {
                badge: "calendar-check",
                title: clip(`${by} completed the meeting with ${who}`, TITLE_MAX),
                body: bodyLine(payload.outcome),
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2110: { // NOTE_ADDED
            const who = payload.parentName ?? "a client"
            return {
                badge: "sticky-note",
                title: clip(`${by} added a note on ${who}`, TITLE_MAX),
                // The note title. A note saved without one shows its text instead.
                body: bodyLine(payload.title || payload.description),
                url: payload.parentUrl,
            }
        }
        case 2210: { // CALL_MADE
            const who = payload.parentName ?? payload.contactPersonName ?? "a client"
            const contact = payload.contactPersonName
            return {
                badge: "phone",
                title: clip(`${by} logged a call with ${who}`, TITLE_MAX),
                // The call log title. A call saved without one names the person spoken to.
                body: bodyLine(payload.title || (contact && `With ${contact}`)),
                url: payload.parentUrl,
            }
        }
        case 2310: { // DOCUMENT_UPLOADED
            const who = payload.parentName ?? "a client"
            return {
                badge: "file-text",
                title: clip(`${by} uploaded a document to ${who}`, TITLE_MAX),
                body: bodyLine(payload.fileName ?? payload.title),
                url: payload.parentUrl,
            }
        }
        case 2410: { // QUOTATION_SENT
            const who = payload.parentName ?? "a client"
            const amount = payload.amount
            const amountStr = amount ? `₹${Number(amount).toLocaleString("en-IN")}` : undefined
            return {
                badge: "indian-rupee",
                title: clip(`${by} sent a quotation to ${who}`, TITLE_MAX),
                body: bodyLine(amountStr, payload.title),
                url: payload.parentUrl,
            }
        }
        default: {
            const fallback = (EVENT_TYPE as Record<number, string>)[type] ?? "Activity"
            return {
                badge: "bell",
                title: clip(fallback.replace(/_/g, " ").toLowerCase(), TITLE_MAX),
                body: "An update was recorded",
            }
        }
    }
}
