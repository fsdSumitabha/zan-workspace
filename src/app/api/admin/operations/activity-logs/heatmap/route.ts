import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import ActivityLog from "@/models/ActivityLog"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

const ADMIN_ROLES = [10, 20]

/**
 * Daily activity counts for a calendar year — feeds the GitHub-style
 * contribution heatmap on the activity-log and profile pages.
 *
 * Scope rules mirror the main GET endpoint:
 *   - non-admin: forced to userId = self.id
 *   - admin: optional `userId` query param; omit it for "all users"
 */
export async function GET(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const yearParam = searchParams.get("year")
        const now = new Date()
        const year = yearParam
            ? Number.parseInt(yearParam, 10)
            : now.getUTCFullYear()

        if (!Number.isFinite(year) || year < 2000 || year > 2100) {
            return NextResponse.json(
                { success: false, message: "Invalid year" },
                { status: 400 }
            )
        }

        const isAdmin = ADMIN_ROLES.includes(authUser.role)
        const requestedUserId = searchParams.get("userId")?.trim() || ""

        let targetUserId: string | null
        if (isAdmin) {
            targetUserId = requestedUserId || null // null → all users
        } else {
            targetUserId = authUser.id
        }

        const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
        const yearEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))

        const match: Record<string, unknown> = {
            createdAt: { $gte: yearStart, $lt: yearEnd },
        }

        if (targetUserId) {
            if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid userId" },
                    { status: 400 }
                )
            }
            match.userId = new mongoose.Types.ObjectId(targetUserId)
        }

        const results = (await ActivityLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt",
                            timezone: "UTC",
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ])) as Array<{ _id: string; count: number }>

        const days = results.map((r) => ({ date: r._id, count: r.count }))
        const total = days.reduce((sum, d) => sum + d.count, 0)

        return NextResponse.json({
            success: true,
            data: {
                year,
                total,
                days,
                scope: isAdmin && !requestedUserId ? "all" : "self",
            },
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("ACTIVITY_LOGS_HEATMAP_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to load heatmap" },
            { status: 500 }
        )
    }
}
