import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Notification from "@/models/Notification"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const { id } = await context.params
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 })
        }

        const userId = new mongoose.Types.ObjectId(authUser.id)
        const now = new Date()

        const result = await Notification.updateOne(
            { _id: new mongoose.Types.ObjectId(id), recipient: userId },
            [
                {
                    $set: {
                        readAt: now,
                        seenAt: { $ifNull: ["$seenAt", now] },
                    },
                },
            ],
            { updatePipeline: true }
        )

        if (result.matchedCount === 0) {
            return NextResponse.json({ success: false, message: "Notification not found" }, { status: 404 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("NOTIFICATIONS_READ_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to mark read" }, { status: 500 })
    }
}
