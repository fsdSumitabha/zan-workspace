import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import { MEETING_MANAGE_ROLES } from "@/constants/meetingRoles"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { syncMeetingToGoogle } from "@/lib/google/calendar/syncMeeting"

/**
 * POST /api/admin/operations/meetings/:id/google-sync
 *
 * The "Try again" button. Makes Google Calendar match the meeting as it is
 * in the CRM now: a cancelled meeting is taken off the guests' calendars, a
 * rescheduled one is moved to its new time.
 *
 * It also fixes meetings from before 19 Nov 2026, whose Google event id was
 * never saved. syncMeetingToGoogle finds the event and saves its id.
 *
 * Nothing changes in the CRM, so there is no timeline entry and no
 * notification. Google emails the guests itself.
 */
export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, MEETING_MANAGE_ROLES)
        await dbConnect()

        const { id } = await context.params
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid meeting ID" },
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

        const google = await syncMeetingToGoogle(meeting)
        const fresh = await Meeting.findById(id).select("external").lean<{ external?: unknown }>()

        const message =
            google.status === "cancelled"
                ? "Cancelled in Google Calendar. Google emailed the guests."
                : google.status === "updated"
                  ? "Google Calendar now has the new time. Google emailed the guests."
                  : google.status === "skipped"
                    ? "Nothing to change in Google Calendar."
                    : google.message

        return NextResponse.json(
            {
                success: google.status !== "failed",
                message,
                google,
                data: { external: fresh?.external ?? null },
            },
            { status: google.status === "failed" ? 502 : 200 }
        )
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("MEETING GOOGLE SYNC ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}
