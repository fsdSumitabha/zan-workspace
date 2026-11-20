/**
 * How long to wait before trying a failed send again.
 *
 * ## Full jitter, not half
 *
 * Without jitter, fifty recipients that failed in the same second all
 * retry in the same second, and the provider that just throttled us sees
 * the same burst again. Full jitter spreads them across the whole window:
 *
 *     delay = random(0, min(max, base * 2^attempt))
 *
 * Half jitter (`d/2 + random(0, d/2)`) keeps a floor, which is better for
 * a single caller waiting on one resource and worse here, because the
 * floor is exactly what makes the burst. The whole point is to break up
 * the convoy.
 */

export interface BackoffConfig {
    backoffBaseMs: number
    backoffMaxMs: number
}

/**
 * Milliseconds to wait before attempt number `attempt`.
 *
 * `attempt` is the attempt that just failed, counting from 1, so the first
 * retry is computed with attempt = 1.
 */
export function backoffMs(
    attempt: number,
    config: BackoffConfig,
    random: () => number = Math.random
): number {
    const safeAttempt = Math.max(1, Math.min(attempt, 20))

    // 2^20 is about a million; the cap below bounds it anyway, but the
    // clamp stops the shift overflowing into Infinity on a silly input.
    const ceiling = Math.min(
        config.backoffMaxMs,
        config.backoffBaseMs * 2 ** (safeAttempt - 1)
    )

    return Math.floor(random() * ceiling)
}

/** When a job that just failed becomes claimable again. */
export function nextAttemptAt(
    attempt: number,
    config: BackoffConfig,
    now: Date = new Date(),
    random: () => number = Math.random
): Date {
    return new Date(now.getTime() + backoffMs(attempt, config, random))
}

/**
 * How long a worker should wait before the next wake-up when the rate
 * limiter had nothing to give.
 *
 * Short and fixed. The limiter's window is one second, so a long wait
 * would leave the budget unspent while a campaign sits idle.
 */
export function throttleWaitMs(): number {
    return 1_000 + Math.floor(Math.random() * 1_000)
}
