import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        const { id } = await context.params


        const meetings = await Meeting.find({
            entityType: 0, // LEAD
            entityId: id
        })
            .sort({ scheduledAt: -1 }) // latest first
            .lean()

        return NextResponse.json({
            success: true,
            meetings
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to fetch meetings" },
            { status: 500 }
        )
    }
}