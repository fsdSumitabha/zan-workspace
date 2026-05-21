import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import StatsSnapshot, {
    type IStatsSnapshot,
} from "@/models/StatsSnapshot"
import { computeStats } from "@/lib/stats/computeStats"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

/**
 * GET /api/admin/operations/stats
 *
 * Returns the cached dashboard counters. Lazy refresh: if the cached
 * snapshot is missing or older than `TTL_MS`, the next request
 * recomputes (one set of `countDocuments` queries) and upserts the
 * snapshot. Subsequent reads are O(1) point lookups.
 *
 * Concurrency: if two requests find it stale at the same time, both
 * may compute and write. Numbers should be identical, so last-write-
 * wins is fine — no correctness issue, just one wasted recompute.
 */

const SNAPSHOT_ID = "operations_stats"
const TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)
        await dbConnect()

        const existing = (await StatsSnapshot.findById(
            SNAPSHOT_ID
        ).lean()) as IStatsSnapshot | null

        const isFresh =
            existing &&
            Date.now() - new Date(existing.updatedAt).getTime() < TTL_MS

        if (isFresh && existing) {
            return NextResponse.json({ success: true, data: existing })
        }

        // Stale or missing — recompute, then upsert.
        const computed = await computeStats()
        const fresh = (await StatsSnapshot.findByIdAndUpdate(
            SNAPSHOT_ID,
            { $set: computed },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean()) as IStatsSnapshot

        return NextResponse.json({ success: true, data: fresh })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("STATS_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to load stats" },
            { status: 500 }
        )
    }
}
