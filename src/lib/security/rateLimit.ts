/**
 * Per-key fixed-window rate limiter, in-memory.
 *
 * In-memory means each Node process owns its own counters — fine for a
 * single-instance deploy, lossy across restarts/horizontal scale. The
 * `checkRateLimit` signature is intentionally storage-agnostic so the
 * implementation can be swapped for Redis/Upstash later without
 * touching the call sites in the route.
 */

interface Bucket {
    count: number
    resetAt: number
}

export interface RateLimitResult {
    allowed: boolean
    retryAfterSec: number
}

const buckets = new Map<string, Bucket>()
let lastCleanup = 0

/**
 * Drop expired buckets at most once a minute so the Map doesn't grow
 * unbounded under high cardinality (many IPs over time).
 */
function maybeCleanup(now: number): void {
    if (now - lastCleanup < 60_000) return
    lastCleanup = now
    for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k)
    }
}

export function checkRateLimit(
    key: string,
    limit: number,
    windowMs: number
): RateLimitResult {
    const now = Date.now()
    maybeCleanup(now)

    const existing = buckets.get(key)

    if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, retryAfterSec: 0 }
    }

    if (existing.count >= limit) {
        return {
            allowed: false,
            retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
        }
    }

    existing.count += 1
    return { allowed: true, retryAfterSec: 0 }
}
