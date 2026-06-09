import dayjs from "dayjs"
import { EVENT_TYPE, type EventType } from "@/constants/eventTypes"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"
import type { NotificationActor, RenderedMessage } from "./types"

function leadUrl(id: string): string {
    return `/admin/operations/leads/${id}`
}
function clientUrl(id: string): string {
    return `/admin/operations/clients/${id}`
}
function projectUrl(id: string): string {
    return `/admin/operations/projects/${id}`
}

function fmtMeetingTime(d: string | Date | undefined): string {
    if (!d) return ""
    const day = dayjs(d)
    const now = dayjs()
    const diff = day.startOf("day").diff(now.startOf("day"), "day")
    const time = day.format("h:mm A")
    if (diff === 0) return `Today at ${time}`
    if (diff === 1) return `Tomorrow at ${time}`
    if (diff === -1) return `Yesterday at ${time}`
    if (diff > 1 && diff < 7) return `${day.format("dddd")} at ${time}`
    return `${day.format("MMM D")} at ${time}`
}

function statusLabel(metaMap: any, code: number | undefined): string | undefined {
    if (code === undefined || code === null) return undefined
    return metaMap?.[code]?.label
}

function clip(s: string, max: number): string {
    if (s.length <= max) return s
    return s.slice(0, max - 1).trimEnd() + "…"
}

function parentUrlFromMeeting(meeting: any): string | undefined {
    if (!meeting?.entityType || !meeting?.entityId) return undefined
    const id = String(meeting.entityId)
    switch (meeting.entityType) {
        case 0: return leadUrl(id)
        case 1: return clientUrl(id)
        case 2: return projectUrl(id)
        default: return undefined
    }
}

export function renderMessage(
    type: EventType,
    payload: Record<string, any>,
    _actor: NotificationActor | null,
): RenderedMessage {
    switch (type) {
        case 1000: { // LEAD_CREATED
            const name = payload.lead?.name ?? "a new lead"
            const src = payload.lead?.source
            return {
                badge: "target",
                title: clip(`New lead from ${name}`, 60),
                body: src ? `Came in via ${src}` : "New lead added",
                url: leadUrl(String(payload.lead?._id ?? "")),
            }
        }
        case 1010: { // LEAD_CONVERTED
            const name = payload.lead?.name ?? payload.client?.name ?? "Lead"
            return {
                badge: "party-popper",
                title: clip(`${name} is now a client`, 60),
                body: "Converted from lead today",
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1020: { // LEAD_STATUS_CHANGED
            const name = payload.lead?.name ?? "Lead"
            const to = statusLabel(LEAD_STATUS_META, payload.newStatus)
            const from = statusLabel(LEAD_STATUS_META, payload.oldStatus)
            return {
                badge: "refresh-cw",
                title: clip(to ? `${name} moved to ${to}` : `${name} status updated`, 60),
                body: from ? `Was in ${from} before` : undefined,
                url: leadUrl(String(payload.lead?._id ?? "")),
            }
        }
        case 1100: { // CLIENT_CREATED
            const name = payload.client?.name ?? "New client"
            const company = payload.client?.company
            return {
                badge: "user-plus",
                title: clip(`New client — ${name}`, 60),
                body: company ? company : undefined,
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1110: { // CLIENT_STATUS_CHANGED
            const name = payload.client?.name ?? "Client"
            const to = statusLabel(CLIENT_STATUS_META, payload.newStatus)
            const from = statusLabel(CLIENT_STATUS_META, payload.oldStatus)
            return {
                badge: "refresh-cw",
                title: clip(to ? `${name} moved to ${to}` : `${name} status updated`, 60),
                body: from ? `Was ${from} before` : undefined,
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1200: { // PROJECT_CREATED
            const title = payload.project?.title ?? "New project"
            const client = payload.clientName
            return {
                badge: "folder-plus",
                title: clip(`New project — ${title}`, 60),
                body: client ? `Created for ${client}` : undefined,
                url: projectUrl(String(payload.project?._id ?? "")),
            }
        }
        case 1210: { // PROJECT_STATUS_CHANGED
            const title = payload.project?.title ?? "Project"
            const to = statusLabel(PROJECT_STATUS_META, payload.newStatus)
            const from = statusLabel(PROJECT_STATUS_META, payload.oldStatus)
            return {
                badge: "refresh-cw",
                title: clip(to ? `${title} moved to ${to}` : `${title} status updated`, 60),
                body: from ? `Was ${from} before` : undefined,
                url: projectUrl(String(payload.project?._id ?? "")),
            }
        }
        case 2010: { // MEETING_SCHEDULED
            const who = payload.parentName ?? "client"
            return {
                badge: "calendar",
                title: clip(`Meeting with ${who}`, 60),
                body: fmtMeetingTime(payload.meeting?.scheduledAt) || undefined,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2020: { // MEETING_RESCHEDULED
            const who = payload.parentName ?? "client"
            const when = fmtMeetingTime(payload.meeting?.scheduledAt)
            return {
                badge: "calendar-clock",
                title: clip(`Meeting with ${who} rescheduled`, 60),
                body: when ? `Now ${when}` : undefined,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2030: { // MEETING_CANCELLED
            const who = payload.parentName ?? "client"
            const when = fmtMeetingTime(payload.meeting?.scheduledAt)
            return {
                badge: "calendar-x",
                title: clip(`Meeting with ${who} cancelled`, 60),
                body: when ? `Was set for ${when}` : undefined,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2050: { // MEETING_COMPLETED
            const who = payload.parentName ?? "client"
            return {
                badge: "calendar-check",
                title: clip(`Meeting with ${who} completed`, 60),
                body: payload.outcome ? clip(String(payload.outcome), 90) : "Add your meeting notes",
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2110: { // NOTE_ADDED
            const who = payload.parentName ?? "client"
            const preview = payload.description || payload.title || ""
            return {
                badge: "sticky-note",
                title: clip(`Note added for ${who}`, 60),
                body: preview ? `"${clip(String(preview), 80)}"` : undefined,
                url: payload.parentUrl,
            }
        }
        case 2210: { // CALL_MADE
            const who = payload.parentName ?? payload.contactPersonName ?? "client"
            return {
                badge: "phone",
                title: clip(`Call logged with ${who}`, 60),
                body: callBody(payload),
                url: payload.parentUrl,
            }
        }
        case 2310: { // DOCUMENT_UPLOADED
            const who = payload.parentName ?? "client"
            const filename = payload.fileName ?? payload.title
            return {
                badge: "file-text",
                title: clip(`Document uploaded for ${who}`, 60),
                body: filename ? clip(String(filename), 80) : undefined,
                url: payload.parentUrl,
            }
        }
        case 2410: { // QUOTATION_SENT
            const who = payload.parentName ?? "client"
            const amount = payload.amount
            const validity = payload.validityDays
            const amountStr = amount ? `₹${Number(amount).toLocaleString("en-IN")}` : undefined
            const body = amountStr && validity
                ? `${amountStr} · valid for ${validity} days`
                : (amountStr ?? payload.title ?? undefined)
            return {
                badge: "indian-rupee",
                title: clip(`Quotation sent to ${who}`, 60),
                body,
                url: payload.parentUrl,
            }
        }
        default: {
            const fallback = (EVENT_TYPE as Record<number, string>)[type] ?? "Activity"
            return {
                badge: "bell",
                title: clip(fallback.replace(/_/g, " ").toLowerCase(), 60),
                body: "An update was recorded",
            }
        }
    }
}

function callBody(payload: Record<string, any>): string | undefined {
    if (payload.followUpRequired) return "Follow-up needed"
    const status = payload.status
    const duration = payload.duration
    const contact = payload.contactPersonName
    if (status === 0 && duration) {
        const mins = Math.max(1, Math.round(Number(duration) / 60))
        return contact ? `Connected · ${mins} min with ${contact}` : `Connected · ${mins} min`
    }
    switch (status) {
        case 1: return "No answer"
        case 2: return "Busy"
        case 3: return "Call failed"
    }
    if (contact) return `With ${contact}`
    return undefined
}
