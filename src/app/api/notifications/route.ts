import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Notification from "@/models/Notification"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

// just added a commit
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const limit = Math.min(Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT)
        const before = searchParams.get("before")
        const onlyUnread = searchParams.get("unread") === "true"

        const userId = new mongoose.Types.ObjectId(authUser.id)

        const filter: Record<string, unknown> = { recipient: userId }
        if (onlyUnread) filter.readAt = null
        if (before && mongoose.Types.ObjectId.isValid(before)) {
            filter._id = { $lt: new mongoose.Types.ObjectId(before) }
        }

        const totalFilter: Record<string, unknown> = { recipient: userId }
        if (onlyUnread) totalFilter.readAt = null

        const [rows, unseen, unread, total] = await Promise.all([
            Notification.find(filter)
                .sort({ _id: -1 })
                .limit(limit)
                .lean(),
            Notification.countDocuments({ recipient: userId, seenAt: null }),
            Notification.countDocuments({ recipient: userId, readAt: null }),
            Notification.countDocuments(totalFilter),
        ])

        const nextCursor = rows.length === limit ? String(rows[rows.length - 1]._id) : null

        return NextResponse.json({ success: true, data: rows, unseen, unread, total, nextCursor })
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("NOTIFICATIONS_GET_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to load notifications" }, { status: 500 })
    }
}
    