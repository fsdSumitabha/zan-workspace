import Meeting from "@/models/Meeting"
import { MEETING_STATUS } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import { meetingZone } from "@/lib/time/meetingTime"
import {
    cancelMeetEvent,
    findMeetEventId,
    googleErrorStatus,
    isGoogleAuthError,
    isGoogleCalendarConfigured,
    isGoogleGoneError,
    rescheduleMeetEvent,
} from "./calendar"

/**
 * What happened in Google Calendar.
 * - cancelled: the event is deleted. Google emailed the guests.
 * - updated: the event moved to the meeting's time. Google emailed the guests.
 * - skipped: nothing to do. An offline meeting, or a missed or completed one.
 * - failed: Google did not change. `message` says why, in plain words.
 */
export type GoogleSyncResult =
    | { status: "cancelled" | "updated" | "skipped"; message?: string }
    | { status: "failed"; message: string }

/** The meeting fields this needs. A Mongoose document or a lean object both work. */
export interface SyncableMeeting {
    _id: unknown
    title?: string
    meetingType?: number
    status: number
    scheduledAt: Date
    timeZone?: string | null
    region?: string | null
    rescheduleHistory?: Array<{ oldDate?: Date | null }> | null
    external?: { eventId?: string | null } | null
}

/**
 * Makes Google Calendar match the meeting in the CRM:
 * - CANCELLED: the event is deleted. The guests get Google's cancellation
 *   email and the meeting leaves their calendars.
 * - SCHEDULED or RESCHEDULED: the event moves to the meeting's time. The
 *   guests get Google's update email.
 * - MISSED or COMPLETED: nothing changes.
 *
 * The CRM change is already saved when this runs. The CRM is the record, so a
 * Google failure never undoes it. The failure is saved on the meeting
 * (external.syncError) instead, and the meeting card shows it with a
 * "Try again" button.
 *
 * Never throws.
 */
export async function syncMeetingToGoogle(meeting: SyncableMeeting): Promise<GoogleSyncResult> {
    const id = String(meeting._id)
    const wantsCancel = meeting.status === MEETING_STATUS.CANCELLED
    const wantsTime =
        meeting.status === MEETING_STATUS.SCHEDULED ||
        meeting.status === MEETING_STATUS.RESCHEDULED

    // Only online meetings get a Google event. See POST /meetings.
    if (meeting.meetingType !== MEETING_TYPE.ONLINE || (!wantsCancel && !wantsTime)) {
        return { status: "skipped" }
    }

    let eventId = meeting.external?.eventId || null

    if (!isGoogleCalendarConfigured()) {
        if (!eventId) return { status: "skipped" }
        return record(id, eventId, meeting.status, {
            status: "failed",
            message: "Google Calendar is not connected on this server, so the guests were not told. Tell them yourself.",
        })
    }

    try {
        if (!eventId) {
            eventId = await findMeetEventId({
                crmMeetingId: id,
                title: meeting.title,
                starts: candidateStarts(meeting),
            })
        }

        if (!eventId) {
            return record(id, null, meeting.status, {
                status: "failed",
                message: "This meeting was not found in Google Calendar, so the guests were not told. Tell them yourself.",
            })
        }

        if (wantsCancel) {
            await cancelMeetEvent(eventId, "all")
            return record(id, eventId, meeting.status, { status: "cancelled" })
        }

        await rescheduleMeetEvent({
            googleEventId: eventId,
            startISO: new Date(meeting.scheduledAt).toISOString(),
            timeZone: meetingZone(meeting),
            sendUpdates: "all",
            crmMeetingId: id,
        })
        return record(id, eventId, meeting.status, { status: "updated" })
    } catch (err) {
        console.error(`[google-calendar] sync of meeting ${id} failed:`, err)
        return record(id, eventId, meeting.status, { status: "failed", message: explain(err) })
    }
}

/**
 * The times the Google event may start at. Google has the time it was last
 * sent. Before 19 Nov 2026 a reschedule never reached Google, so an older
 * event can still sit at the time the meeting was first made for.
 */
function candidateStarts(meeting: SyncableMeeting): Date[] {
    const times = [
        meeting.scheduledAt,
        ...(meeting.rescheduleHistory ?? []).map((h) => h?.oldDate),
    ]
        .filter((t): t is Date => Boolean(t))
        .map((t) => new Date(t))
        .filter((t) => !Number.isNaN(t.getTime()))

    const seen = new Set<number>()
    return times.filter((t) => (seen.has(t.getTime()) ? false : (seen.add(t.getTime()), true)))
}

/** Saves the outcome on the meeting, then returns it. */
async function record(
    id: string,
    eventId: string | null,
    status: number,
    result: GoogleSyncResult
): Promise<GoogleSyncResult> {
    const set: Record<string, unknown> = {}
    if (eventId) {
        set["external.provider"] = "GOOGLE"
        set["external.eventId"] = eventId
    }

    let update: Record<string, unknown>
    if (result.status === "failed") {
        set["external.syncError"] = result.message
        update = { $set: set }
    } else {
        set["external.syncedAt"] = new Date()
        set["external.syncedStatus"] = status
        update = { $set: set, $unset: { "external.syncError": "" } }
    }

    try {
        // updateOne, not save: this is bookkeeping, not a change by a person,
        // so it stays out of the activity log.
        await Meeting.updateOne({ _id: id }, update)
    } catch (err) {
        console.error(`[google-calendar] could not save the sync result of meeting ${id}:`, err)
    }
    return result
}

function explain(err: unknown): string {
    if (isGoogleAuthError(err)) {
        return "Google Calendar access has expired. An admin must reconnect it. Then press Try again."
    }
    if (isGoogleGoneError(err)) {
        return "The event is no longer in Google Calendar. Someone may have deleted it there. Tell the guests yourself."
    }
    if (googleErrorStatus(err) === 403) {
        return "The Google account does not allow this change. Ask an admin to check the calendar access."
    }
    const raw = err instanceof Error ? err.message : String(err)
    return `Google Calendar did not accept the change (${raw.slice(0, 120)}). Press Try again.`
}
