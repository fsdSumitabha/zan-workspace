import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"

import { MEETING_STATUS } from "@/constants/meetingStatus"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"

import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedFindByIdAndUpdate, auditedUpdateByNumericEntityType,} from "@/lib/activity-log"

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await requireRole(req, [10, 60, 45, 70])

        await dbConnect()

        const { id } = await context.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid meeting ID" },
                { status: 400 }
            )
        }

        const body = await req.json()
        const { status, outcome } = body as {
            status?: number
            outcome?: string
        }

        if (status !== MEETING_STATUS.CANCELLED && status !== MEETING_STATUS.COMPLETED) {
            return NextResponse.json({ success: false, message: "status must be CANCELLED or COMPLETED" }, { status: 400 })
        }

        const trimmedOutcome = (outcome ?? "").trim()

        if (status === MEETING_STATUS.COMPLETED && !trimmedOutcome) {
            return NextResponse.json({ success: false, message: "Outcome note is required to mark as completed" }, { status: 400 })
        }

        const meeting = await Meeting.findById(id)
        if (!meeting) {
            return NextResponse.json({ success: false, message: "Meeting not found" }, { status: 404 })
        }

        // COMPLETED only valid once the meeting time has passed. CANCELLED is allowed any time before close.
        if (status === MEETING_STATUS.COMPLETED && meeting.scheduledAt.getTime() > Date.now()) {
            return NextResponse.json({ success: false, message: "Cannot mark a future meeting as completed" }, { status: 409 })
        }

        if (
            meeting.status === MEETING_STATUS.CANCELLED ||
            meeting.status === MEETING_STATUS.MISSED ||
            meeting.status === MEETING_STATUS.COMPLETED
        ) {
            return NextResponse.json({ success: false, message: "Meeting is already closed" }, { status: 409 })
        }

        const updatePayload: Record<string, unknown> = { status }
        if (status === MEETING_STATUS.COMPLETED) {
            updatePayload.outcome = trimmedOutcome
        }

        const updated = await auditedFindByIdAndUpdate(
            Meeting,
            "MEETING",
            id,
            updatePayload,
            {},
            authUser.id
        )

        if (!updated) {
            return NextResponse.json(
                { success: false, message: "Meeting not found" },
                { status: 404 }
            )
        }

        const interactionType = status as typeof INTERACTION_TYPE.MEETING_CANCELLED | typeof INTERACTION_TYPE.MEETING_COMPLETED

        const friendlyTitle = status === MEETING_STATUS.COMPLETED ? "Meeting completed" : "Meeting cancelled"

        const interaction = await auditedCreate(
            Interaction,
            "INTERACTION",
            {
                entityType: meeting.entityType,
                entityId: meeting.entityId,
                type: interactionType,
                title: friendlyTitle,
                // For COMPLETED the outcome IS the description (the note).
                // For MISSED there's no note, leave undefined.
                description:
                    status === MEETING_STATUS.COMPLETED
                        ? trimmedOutcome
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

        return NextResponse.json({
            success: true,
            message: status === MEETING_STATUS.COMPLETED ? "Meeting marked as completed" : "Meeting cancelled",
            data: { id: String(updated._id), status: updated.status, outcome: updated.outcome },
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
