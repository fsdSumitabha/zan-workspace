import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import StatsSnapshot, {
    type IStatsSnapshot,
} from "@/models/StatsSnapshot"
import { computeStats } from "@/lib/stats/computeStats"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { statsSnapshotKey } from "@/lib/stats/snapshotKey"

/**
 * GET /api/admin/operations/stats
 *
 * Returns the cached dashboard counters, scoped to the regions the
 * signed-in user can see. Lazy refresh: if the cached snapshot is missing
 * or older than `TTL_MS`, the next request recomputes (one set of
 * `countDocuments` queries) and upserts the snapshot. Subsequent reads are
 * O(1) point lookups.
 *
 * There is one snapshot row per region set, so an admin who sees three
 * regions and a US agent who sees one do not share a cache entry.
 *
 * Concurrency: if two requests find it stale at the same time, both
 * may compute and write. Numbers should be identical, so last-write-
 * wins is fine — no correctness issue, just one wasted recompute.
 */

const TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)
        await dbConnect()

        // One snapshot per region set. requireAuth has already put the
        // user's regions in context, so this has to come after it.
        const snapshotId = statsSnapshotKey()

        const existing = (await StatsSnapshot.findById(
            snapshotId
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
            snapshotId,
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
