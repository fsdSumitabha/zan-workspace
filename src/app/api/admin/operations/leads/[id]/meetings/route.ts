import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Was missing. Without it there is no region context, so every
        // query below is denied, and before regions this route was
        // readable by anyone. Role gating is left to the parent resource;
        // the region filter does the data scoping.
        await requireAuth(req)

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
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to fetch meetings" },
            { status: 500 }
        )
    }
}