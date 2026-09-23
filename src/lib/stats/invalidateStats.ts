import StatsSnapshot from "@/models/StatsSnapshot"

/**
 * Deletes the cached snapshot so the next `GET /stats` recomputes
 * fresh. Used by post-save / post-update hooks on the entities whose
 * counts feed the panel (Lead, Client, Project, Meeting).
 *
 * Safe to call when the doc doesn't exist yet — delete is a no-op.
 *
 * There is one snapshot per region set now, not one in total. A write in
 * one region changes the numbers an admin sees as well, so every variant
 * goes. There are only a handful of rows and this runs after a write, so
 * clearing them all is cheaper than working out which ones are affected.
 */
export async function invalidateStatsSnapshot(): Promise<void> {
    await StatsSnapshot.deleteMany({})
}
