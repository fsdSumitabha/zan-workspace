import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Notification from "@/models/Notification"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

export async function PATCH(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const userId = new mongoose.Types.ObjectId(authUser.id)
        const now = new Date()

        const result = await Notification.updateMany(
            { recipient: userId, readAt: null },
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

        return NextResponse.json({ success: true, updated: result.modifiedCount ?? 0 })
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("NOTIFICATIONS_READ_ALL_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to mark all read" }, { status: 500 })
    }
}
