import StatsSnapshot from "@/models/StatsSnapshot"

const SNAPSHOT_ID = "operations_stats"

/**
 * Deletes the cached snapshot so the next `GET /stats` recomputes
 * fresh. Used by post-save / post-update hooks on the entities whose
 * counts feed the panel (Lead, Client, Project, Meeting).
 *
 * Safe to call when the doc doesn't exist yet — delete is a no-op.
 */
export async function invalidateStatsSnapshot(): Promise<void> {
    await StatsSnapshot.findByIdAndDelete(SNAPSHOT_ID)
}
