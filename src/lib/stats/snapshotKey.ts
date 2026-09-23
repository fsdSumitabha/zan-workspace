import { getRegionContext } from "@/lib/region-scope"

const PREFIX = "operations_stats"

/**
 * Cache key for the dashboard counters.
 *
 * The counts themselves are already region-correct: `computeStats` calls
 * `countDocuments`, and regionScopePlugin filters that. The cache is the
 * problem. One fixed key meant whichever region loaded the dashboard first
 * wrote its numbers, and every other region then read them.
 *
 * So the key carries the region set it was computed for. A US agent and an
 * admin who sees all three regions get different rows.
 *
 * Sorted, so ["US","IN"] and ["IN","US"] are the same cache entry.
 */
export function statsSnapshotKey(): string {
    const regions = getRegionContext()?.regions ?? []
    if (regions.length === 0) return `${PREFIX}:none`
    return `${PREFIX}:${[...regions].sort().join("-")}`
}

export const STATS_SNAPSHOT_PREFIX = PREFIX
