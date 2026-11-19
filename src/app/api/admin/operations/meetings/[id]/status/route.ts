import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"

import { MEETING_STATUS } from "@/constants/meetingStatus"
import { MEETING_MANAGE_ROLES } from "@/constants/meetingRoles"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"

import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedUpdateByNumericEntityType, } from "@/lib/activity-log"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { resolveParentName } from "@/lib/notifications/resolveParentName"
import { syncMeetingToGoogle, type GoogleSyncResult } from "@/lib/google/calendar/syncMeeting"

// The statuses that close a meeting, and what each one writes: the timeline
// title, the notification event and the reply message.
const CLOSE_STATUS = {
    [MEETING_STATUS.CANCELLED]: { title: "Meeting cancelled", event: EVENT_CODE.MEETING_CANCELLED, message: "Meeting cancelled" },
    [MEETING_STATUS.MISSED]: { title: "Meeting missed", event: EVENT_CODE.MEETING_MISSED, message: "Meeting marked as missed" },
    [MEETING_STATUS.COMPLETED]: { title: "Meeting completed", event: EVENT_CODE.MEETING_COMPLETED, message: "Meeting marked as completed" },
}

type CloseStatus = keyof typeof CLOSE_STATUS

const OPEN_STATUSES: number[] = [MEETING_STATUS.SCHEDULED, MEETING_STATUS.RESCHEDULED]

const REASON_MAX = 500

/**
 * PATCH /api/admin/operations/meetings/:id/status
 *
 * Body: { status: CANCELLED | MISSED | COMPLETED, outcome?: string, reason?: string }
 *
 * Closes a meeting. A meeting is never deleted from the CRM; cancelling keeps
 * it, with its history. For an online meeting, CANCELLED also deletes the
 * Google Calendar event, so Google emails the guests and the meeting leaves
 * their calendars. The reply's `google` field says whether that worked.
 */
export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await requireRole(req, MEETING_MANAGE_ROLES)

        await dbConnect()

        const { id } = await context.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid meeting ID" },
                { status: 400 }
            )
        }

        const body = await req.json()
        const { status, outcome, reason } = body as {
            status?: number
            outcome?: string
            reason?: string
        }

        if (typeof status !== "number" || !(status in CLOSE_STATUS)) {
            return NextResponse.json({ success: false, message: "status must be CANCELLED, MISSED or COMPLETED" }, { status: 400 })
        }
        const close = CLOSE_STATUS[status as CloseStatus]

        const trimmedOutcome = (outcome ?? "").trim()
        // Why it was cancelled. Optional. It goes on the timeline and in the notification.
        const trimmedReason = typeof reason === "string" ? reason.trim().slice(0, REASON_MAX) : ""

        if (status === MEETING_STATUS.COMPLETED && !trimmedOutcome) {
            return NextResponse.json({ success: false, message: "Outcome note is required to mark as completed" }, { status: 400 })
        }

        const meeting = await Meeting.findById(id)
        if (!meeting) {
            return NextResponse.json({ success: false, message: "Meeting not found" }, { status: 404 })
        }

        // COMPLETED and MISSED are only valid once the meeting time has passed. CANCELLED is allowed any time before close.
        if (status !== MEETING_STATUS.CANCELLED && meeting.scheduledAt.getTime() > Date.now()) {
            const label = status === MEETING_STATUS.COMPLETED ? "completed" : "missed"
            return NextResponse.json({ success: false, message: `Cannot mark a future meeting as ${label}` }, { status: 409 })
        }

        if (!OPEN_STATUSES.includes(meeting.status)) {
            return NextResponse.json({ success: false, message: "Meeting is already closed" }, { status: 409 })
        }

        const updatePayload: Record<string, unknown> = { status }

        if (status === MEETING_STATUS.COMPLETED) {
            updatePayload.outcome = trimmedOutcome
        }

        // Only while the meeting is still open. Two people pressing Cancel at
        // once then close it once, and Google is told once.
        const updated = await Meeting.findOneAndUpdate(
            { _id: id, status: { $in: OPEN_STATUSES } },
            updatePayload,
            {
                returnDocument: "after", // return the updated document
                runValidators: true      // ensure schema validators run
            }
        )

        if (!updated) {
            return NextResponse.json(
                { success: false, message: "Meeting is already closed" },
                { status: 409 }
            )
        }

        const interactionType = status as typeof INTERACTION_TYPE.MEETING_CANCELLED | typeof INTERACTION_TYPE.MEETING_MISSED | typeof INTERACTION_TYPE.MEETING_COMPLETED

        const friendlyTitle = close.title

        const interaction = await auditedCreate(
            Interaction,
            4,
            {
                entityType: meeting.entityType,
                entityId: meeting.entityId,
                type: interactionType,
                title: friendlyTitle,
                // COMPLETED: the outcome note. CANCELLED: the reason, when
                // one was given. MISSED: nothing.
                description:
                    status === MEETING_STATUS.COMPLETED
                        ? trimmedOutcome
                        : status === MEETING_STATUS.CANCELLED && trimmedReason
                          ? trimmedReason
                          : undefined,
                createdBy: authUser.id,
                refId: meeting._id,
            },
            authUser.id
        )

        if (
            meeting.entityType === ENTITY_TYPE.LEAD ||
            meeting.entityType === ENTITY_TYPE.CLIENT ||
            meeting.entityType === ENTITY_TYPE.PROJECT
        ) {
            await auditedUpdateByNumericEntityType(
                meeting.entityType,
                String(meeting.entityId),
                {
                    lastInteractionAt: new Date(),
                    lastInteractionId: interaction._id,
                },
                authUser.id
            )
        }

        const parentName = await resolveParentName(meeting.entityType, String(meeting.entityId))
        await emitNotification({
            type: close.event,
            entityType: ENTITY_TYPE.MEETING,
            entityId: meeting._id,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: {
                meeting: { _id: meeting._id, title: meeting.title, entityType: meeting.entityType, entityId: meeting.entityId, scheduledAt: meeting.scheduledAt, timeZone: meeting.timeZone, region: meeting.region },
                parentName,
                outcome: trimmedOutcome || undefined,
                reason: trimmedReason || undefined,
            },
            extraRecipients: Array.isArray(meeting.attendees) ? meeting.attendees.map((a: any) => String(a)) : undefined,
        })

        // Tell Google last, after every CRM write, so a slow Google can never
        // leave the CRM half done. A cancelled online meeting leaves the
        // guests' calendars. Missed and completed change nothing there.
        let google: GoogleSyncResult = { status: "skipped" }
        if (status === MEETING_STATUS.CANCELLED) {
            google = await syncMeetingToGoogle(updated)
        }

        return NextResponse.json({
            success: true,
            message: close.message,
            data: { id: String(updated._id), status: updated.status, outcome: updated.outcome },
            google,
        }, { status: 200 })
    } catch (error) {
        console.error("Meeting Status Update Error:", error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}
