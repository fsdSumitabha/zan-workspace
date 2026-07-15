import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"

import { MEETING_STATUS } from "@/constants/meetingStatus"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { resolveParentName } from "@/lib/notifications/resolveParentName"

import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedFindByIdAndUpdate, auditedUpdateByNumericEntityType,} from "@/lib/activity-log"

/**
 * PATCH /api/admin/operations/meetings/:id/reschedule
 *
 * Body: { scheduledAt: ISO date, reason: string }
 *
 * Updates scheduledAt + status (→ RESCHEDULED), appends to
 * rescheduleHistory, writes a timeline Interaction on the parent
 * entity, and bumps the parent's lastInteractionAt/Id.
 */
export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await requireRole(req, [10, 15, 45, 50, 60, 70])

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

        const newDate = new Date(scheduledAt)
        if (isNaN(newDate.getTime())) {
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

        const meeting = await Meeting.findById(id)
        if (!meeting) {
            return NextResponse.json(
                { success: false, message: "Meeting not found" },
                { status: 404 }
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
        const friendlyTitle = `Meeting rescheduled to ${newDate.toLocaleString()}`

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
            payload: { meeting: { _id: meeting._id, title: meeting.title, entityType: meeting.entityType, entityId: meeting.entityId, scheduledAt: newDate }, parentName, oldDate, reason: trimmedReason },
            extraRecipients: Array.isArray(meeting.attendees) ? meeting.attendees.map((a: any) => String(a)) : undefined,
        })

        return NextResponse.json(
            {
                success: true,
                message: "Meeting rescheduled",
                data: {
                    id: String(updated._id),
                    scheduledAt: updated.scheduledAt,
                    status: updated.status,
                },
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
