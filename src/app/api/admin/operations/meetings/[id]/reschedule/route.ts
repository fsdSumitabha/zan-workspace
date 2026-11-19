import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"

import { MEETING_STATUS } from "@/constants/meetingStatus"
import { MEETING_MANAGE_ROLES } from "@/constants/meetingRoles"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { resolveParentName } from "@/lib/notifications/resolveParentName"

import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedFindByIdAndUpdate, auditedUpdateByNumericEntityType,} from "@/lib/activity-log"
import { meetingZone, parseMeetingStart } from "@/lib/time/meetingTime"
import { syncMeetingToGoogle } from "@/lib/google/calendar/syncMeeting"

/**
 * PATCH /api/admin/operations/meetings/:id/reschedule
 *
 * Body: { scheduledAt: ISO date with its zone, reason: string }
 *
 * Updates scheduledAt + status (→ RESCHEDULED), appends to
 * rescheduleHistory, writes a timeline Interaction on the parent
 * entity, and bumps the parent's lastInteractionAt/Id. For an online
 * meeting it then moves the Google Calendar event, and Google emails the
 * guests the new time. The reply's `google` field says whether that worked.
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
        const { scheduledAt, reason } = body as {
            scheduledAt?: string
            reason?: string
        }

        if (!scheduledAt) {
            return NextResponse.json(
                { success: false, message: "scheduledAt is required" },
                { status: 400 }
            )
        }
        if (!reason || !reason.trim()) {
            return NextResponse.json(
                { success: false, message: "Reason is required" },
                { status: 400 }
            )
        }

        const meeting = await Meeting.findById(id)
        if (!meeting) {
            return NextResponse.json(
                { success: false, message: "Meeting not found" },
                { status: 404 }
            )
        }

        // An exact moment ("...Z") is used as it is. A time without a zone is
        // read in the client's zone, never in the server's (UTC).
        const newDate = parseMeetingStart(scheduledAt, meetingZone(meeting))
        if (!newDate) {
            return NextResponse.json(
                { success: false, message: "Invalid scheduledAt" },
                { status: 400 }
            )
        }
        if (newDate.getTime() <= Date.now()) {
            return NextResponse.json(
                { success: false, message: "scheduledAt must be in the future" },
                { status: 400 }
            )
        }

        // Terminal statuses can't be rescheduled.
        if (
            meeting.status === MEETING_STATUS.CANCELLED ||
            meeting.status === MEETING_STATUS.MISSED ||
            meeting.status === MEETING_STATUS.COMPLETED
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Cannot reschedule a closed meeting",
                },
                { status: 409 }
            )
        }

        const oldDate = meeting.scheduledAt
        const trimmedReason = reason.trim()

        const updated = await auditedFindByIdAndUpdate(
            Meeting,
            4,
            id,
            {
                scheduledAt: newDate,
                status: MEETING_STATUS.RESCHEDULED,
                $push: {
                    rescheduleHistory: {
                        oldDate,
                        newDate,
                        reason: trimmedReason,
                        changedBy: authUser.id,
                        changedAt: new Date(),
                    },
                },
            },
            {},
            authUser.id
        )

        if (!updated) {
            return NextResponse.json(
                { success: false, message: "Meeting not found" },
                { status: 404 }
            )
        }

        // Timeline entry on the parent entity (lead / client / project).
        // No time in the title. The server wrote it with toLocaleString(),
        // which on Vercel is UTC, so India read "8:00 AM" for 1:30 PM. The
        // timeline card shows the old and new times from rescheduleHistory,
        // each in the reader's own zone.
        const friendlyTitle = "Meeting rescheduled"

        const interaction = await auditedCreate(
            Interaction,
            4,
            {
                entityType: meeting.entityType,
                entityId: meeting.entityId,
                type: INTERACTION_TYPE.MEETING_RESCHEDULED,
                title: friendlyTitle,
                description: trimmedReason,
                createdBy: authUser.id,
                refId: meeting._id,
            },
            authUser.id
        )

        // Bump the parent's lastInteractionAt/Id.
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
            type: EVENT_CODE.MEETING_RESCHEDULED,
            entityType: ENTITY_TYPE.MEETING,
            entityId: meeting._id,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: { meeting: { _id: meeting._id, title: meeting.title, entityType: meeting.entityType, entityId: meeting.entityId, scheduledAt: newDate, timeZone: meeting.timeZone, region: meeting.region }, parentName, oldDate, reason: trimmedReason },
            extraRecipients: Array.isArray(meeting.attendees) ? meeting.attendees.map((a: any) => String(a)) : undefined,
        })

        // Move the Google event last, after every CRM write, so a slow Google
        // can never leave the CRM half done. Google emails the guests.
        const google = await syncMeetingToGoogle(updated)

        return NextResponse.json(
            {
                success: true,
                message: "Meeting rescheduled",
                data: {
                    id: String(updated._id),
                    scheduledAt: updated.scheduledAt,
                    status: updated.status,
                },
                google,
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Reschedule Meeting Error:", error)

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
