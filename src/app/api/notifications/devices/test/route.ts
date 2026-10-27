import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { sendPush } from "@/lib/notifications/sendPush"

// Sends a test push to every browser of the signed-in user.
export async function POST(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const result = await sendPush([new mongoose.Types.ObjectId(authUser.id)], {
            title: "Test notification",
            body: "Push notifications work on this device.",
            url: "/admin/operations/notifications",
        })

        return NextResponse.json({ success: true, ...result })
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("PUSH_TEST_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to send test push" }, { status: 500 })
    }
}
