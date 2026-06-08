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

function statusLabel(metaMap: any, code: number | undefined): string | undefined {
    if (code === undefined || code === null) return undefined
    return metaMap?.[code]?.label
}

export function renderMessage(
    type: EventType,
    payload: Record<string, any>,
    _actor: NotificationActor | null,
): RenderedMessage {
    switch (type) {
        case 1000: { // LEAD_CREATED
            const name = payload.lead?.name ?? "New lead"
            const src = payload.lead?.source
            return {
                title: "New lead",
                body: `${name}${src ? ` · ${src}` : ""}`,
                url: leadUrl(String(payload.lead?._id ?? "")),
            }
        }
        case 1010: { // LEAD_CONVERTED
            const leadName = payload.lead?.name ?? "Lead"
            const clientName = payload.client?.name ?? "client"
            return {
                title: "Lead converted",
                body: `${leadName} → ${clientName}`,
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1020: { // LEAD_STATUS_CHANGED
            const name = payload.lead?.name ?? "Lead"
            const to = statusLabel(LEAD_STATUS_META, payload.newStatus)
            return {
                title: "Lead status updated",
                body: to ? `${name} → ${to}` : name,
                url: leadUrl(String(payload.lead?._id ?? "")),
            }
        }
        case 1100: { // CLIENT_CREATED
            const name = payload.client?.name ?? "New client"
            const company = payload.client?.company
            return {
                title: "New client",
                body: `${name}${company ? ` · ${company}` : ""}`,
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1110: { // CLIENT_STATUS_CHANGED
            const name = payload.client?.name ?? "Client"
            const to = statusLabel(CLIENT_STATUS_META, payload.newStatus)
            return {
                title: "Client status updated",
                body: to ? `${name} → ${to}` : name,
                url: clientUrl(String(payload.client?._id ?? "")),
            }
        }
        case 1200: { // PROJECT_CREATED
            return {
                title: "New project",
                body: payload.project?.title ?? "A new project was added",
                url: projectUrl(String(payload.project?._id ?? "")),
            }
        }
        case 1210: { // PROJECT_STATUS_CHANGED
            const name = payload.project?.title ?? "Project"
            const to = statusLabel(PROJECT_STATUS_META, payload.newStatus)
            return {
                title: "Project status updated",
                body: to ? `${name} → ${to}` : name,
                url: projectUrl(String(payload.project?._id ?? "")),
            }
        }
        case 2010: { // MEETING_SCHEDULED
            const t = payload.meeting?.title ?? "Meeting"
            const subject = payload.parentName ? ` · ${payload.parentName}` : ""
            return {
                title: "Meeting scheduled",
                body: `${t}${subject}`,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2020: { // MEETING_RESCHEDULED
            const t = payload.meeting?.title ?? "Meeting"
            const subject = payload.parentName ? ` · ${payload.parentName}` : ""
            return {
                title: "Meeting rescheduled",
                body: `${t}${subject}`,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2030: { // MEETING_CANCELLED
            const t = payload.meeting?.title ?? "Meeting"
            const subject = payload.parentName ? ` · ${payload.parentName}` : ""
            return {
                title: "Meeting cancelled",
                body: `${t}${subject}`,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2050: { // MEETING_COMPLETED
            const t = payload.meeting?.title ?? "Meeting"
            const subject = payload.parentName ? ` · ${payload.parentName}` : ""
            return {
                title: "Meeting completed",
                body: `${t}${subject}`,
                url: parentUrlFromMeeting(payload.meeting),
            }
        }
        case 2110: { // NOTE_ADDED
            return {
                title: "Note added",
                body: payload.parentName ? `Note on ${payload.parentName}` : "A note was added",
                url: payload.parentUrl,
            }
        }
        case 2210: { // CALL_MADE
            return {
                title: "Call logged",
                body: payload.contactPersonName
                    ? `Call with ${payload.contactPersonName}`
                    : payload.parentName
                        ? `Call on ${payload.parentName}`
                        : "A call was logged",
                url: payload.parentUrl,
            }
        }
        case 2410: { // QUOTATION_SENT
            const amount = payload.amount ? `₹${payload.amount}` : undefined
            const where = payload.parentName ? ` · ${payload.parentName}` : ""
            return {
                title: "Quotation sent",
                body: amount ? `${amount}${where}` : payload.title ?? "Quotation sent",
                url: payload.parentUrl,
            }
        }
        default: {
            const fallback = (EVENT_TYPE as Record<number, string>)[type] ?? "Activity"
            return {
                title: fallback.replace(/_/g, " ").toLowerCase(),
                body: "An update was recorded",
            }
        }
    }
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
