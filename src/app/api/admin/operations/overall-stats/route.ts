import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { computeOverallStats } from "@/lib/stats/computeOverallStats"

/**
 * GET /api/admin/operations/overall-stats
 *
 * Roll-up counters across leads, clients, projects, meetings, and users.
 * Open to any logged-in user. No cache — every request runs five
 * `$facet` aggregations in parallel (~50–200ms).
 */
export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)
        await dbConnect()

        const data = await computeOverallStats()

        return NextResponse.json({ success: true, data })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("OVERALL_STATS_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to compute stats" },
            { status: 500 }
        )
    }
}
