import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()
 
        const {
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            meetingLink,
            scheduledAt,
            status
        } = body

        // 1. Create Meeting
        const meeting = await Meeting.create({
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            meetingLink,
            scheduledAt,
            status
        })

        // 2. Create Interaction (timeline entry)
        await Interaction.create({
            entityType,
            entityId,
            type: 2010, // MEETING_SCHEDULED (use constant later)
            title: title,
            description: agenda,
            refId: meeting._id
        })

        return NextResponse.json(
            { success: true, data: meeting },
            { status: 201 }
        )
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create meeting" },
            { status: 500 }
        )
    }
}