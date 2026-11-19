import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import User from "@/models/User"
import { ENTITY_TYPE_META, type EntityType } from "@/constants/entityTypes"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { resolveParentName } from "@/lib/notifications/resolveParentName"

/**
 * GET /api/admin/operations/meetings/:id
 *
 * One meeting, for the meeting page. Same shape as a row of the meetings
 * list, so the same MeetingCard renders it. The region scope applies: a
 * meeting outside the caller's regions is "not found".
 */
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Any signed-in person may read a meeting in their regions, like the
        // meetings list. Changing one needs MEETING_MANAGE_ROLES.
        await requireAuth(req)
        await dbConnect()

        const { id } = await context.params
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid meeting ID" },
                { status: 400 }
            )
        }

        const meeting = await Meeting.findById(id)
            .populate({ path: "attendees", select: "_id name email role avatar", model: User })
            .populate({ path: "createdBy", select: "_id name", model: User })
            .populate({ path: "rescheduleHistory.changedBy", select: "_id name", model: User })
            .lean<Record<string, any>>()

        if (!meeting) {
            return NextResponse.json(
                { success: false, message: "Meeting not found" },
                { status: 404 }
            )
        }

        const title = await resolveParentName(meeting.entityType, String(meeting.entityId))

        return NextResponse.json({
            success: true,
            data: {
                ...meeting,
                entity: {
                    type: meeting.entityType,
                    label: ENTITY_TYPE_META[meeting.entityType as EntityType]?.label ?? "Record",
                    title: title || "N/A",
                },
            },
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("GET MEETING ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to load the meeting" },
            { status: 500 }
        )
    }
}
