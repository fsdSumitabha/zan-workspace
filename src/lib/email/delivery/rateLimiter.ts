import EmailRateCounter from "@/models/EmailRateCounter"

/**
 * One send budget, shared by every worker.
 *
 * ## The bug this exists to prevent
 *
 * Nodemailer's own `rateLimit` applies to one transporter in one process.
 * Ten workers each capped at 10 a second send 100 a second, and the
 * provider sees 100. On a serverless platform there is no single process
 * to hold the count in, so it has to live somewhere every worker can
 * reach. That is this collection.
 *
 * ## Permits are taken in bulk
 *
 * A worker about to send 25 emails asks for 25 permits in one round trip,
 * not 25 round trips. The counter is incremented first and trimmed back if
 * the window is already full, which is the only ordering that is safe
 * under concurrency: incrementing then checking can over-count briefly,
 * while checking then incrementing lets two workers both pass the check.
 *
 * Over-counting is the safe direction. It means we send slightly under the
 * limit for one second, never over it.
 *
 * ## Two windows
 *
 * A per-second window paces the sending, and a per-day window is the guard
 * against a runaway loop. On the Vercel Hobby plan that guard matters more
 * than usual: there is no overage billing, so burning the allowance pauses
 * the whole project for 30 days.
 */

/** Buckets live a little past their window so a late write still lands. */
const SECOND_BUCKET_TTL_MS = 120_000
const DAY_BUCKET_TTL_MS = 48 * 60 * 60 * 1_000

export interface PermitRequest {
    /** Identifies the provider. Every worker on it shares one budget. */
    providerKey: string
    want: number
    perSecond: number
    perDay: number
}

export interface PermitResult {
    granted: number
    /** Set when the daily budget is what stopped us. */
    dailyBudgetReached: boolean
}

/**
 * Takes up to `want` permits, returning how many were actually granted.
 *
 * A worker that gets fewer than it asked for should send only that many
 * and come back; one that gets zero should wait and try again.
 */
export async function takePermits(
    request: PermitRequest,
    now: Date = new Date()
): Promise<PermitResult> {
    const want = Math.max(0, Math.floor(request.want))
    if (want === 0) return { granted: 0, dailyBudgetReached: false }

    // The day budget is checked first. There is no point pacing a second
    // that the day has already spent.
    const dayGranted = await takeFromWindow(
        dayKey(request.providerKey, now),
        want,
        request.perDay,
        DAY_BUCKET_TTL_MS,
        now
    )

    if (dayGranted === 0) {
        return { granted: 0, dailyBudgetReached: true }
    }

    const secondGranted = await takeFromWindow(
        secondKey(request.providerKey, now),
        dayGranted,
        request.perSecond,
        SECOND_BUCKET_TTL_MS,
        now
    )

    // Anything the day allowed but the second did not must go back, or the
    // daily budget drains at the rate we *asked* rather than the rate we
    // sent, and a campaign stops early for no reason.
    if (secondGranted < dayGranted) {
        await releasePermits(
            dayKey(request.providerKey, now),
            dayGranted - secondGranted
        )
    }

    return { granted: secondGranted, dailyBudgetReached: false }
}

/**
 * Hands permits back.
 *
 * Called when a send did not happen after all: the campaign was paused
 * between the permit and the send, or a claim came back empty. Without
 * this the budget leaks and a campaign slows down for no visible reason.
 */
export async function releasePermits(
    bucketId: string,
    count: number
): Promise<void> {
    if (count <= 0) return

    await EmailRateCounter.updateOne(
        { _id: bucketId },
        { $inc: { used: -count } }
    )
}

/** Hands back permits taken for this exact moment. */
export async function releaseNow(
    providerKey: string,
    count: number,
    now: Date = new Date()
): Promise<void> {
    if (count <= 0) return
    await Promise.all([
        releasePermits(secondKey(providerKey, now), count),
        releasePermits(dayKey(providerKey, now), count),
    ])
}

/** How much of the daily budget is gone, for the settings screen. */
export async function dailyUsage(
    providerKey: string,
    now: Date = new Date()
): Promise<number> {
    const row = await EmailRateCounter.findById(dayKey(providerKey, now))
        .lean<{ used: number }>()

    return Math.max(0, row?.used ?? 0)
}

/* ------------------------------------------------------------------ */

async function takeFromWindow(
    bucketId: string,
    want: number,
    limit: number,
    ttlMs: number,
    now: Date
): Promise<number> {
    const safeLimit = Math.max(1, Math.floor(limit))

    // Increment first, then trim. See the note at the top: the other
    // ordering lets two workers both pass the check and both send.
    const doc = await EmailRateCounter.findOneAndUpdate(
        { _id: bucketId },
        {
            $inc: { used: want },
            $setOnInsert: { expiresAt: new Date(now.getTime() + ttlMs) },
        },
        { upsert: true, returnDocument: "after" }
    ).lean<{ used: number }>()

    const used = doc?.used ?? want
    const overshoot = Math.max(0, used - safeLimit)
    const granted = Math.max(0, want - overshoot)

    if (granted < want) {
        await releasePermits(bucketId, want - granted)
    }

    return granted
}

/** "gmail:1763548800" — one bucket per provider per second. */
function secondKey(providerKey: string, now: Date): string {
    return `${providerKey}:${Math.floor(now.getTime() / 1_000)}`
}

/** "gmail:day:2026-11-19" — one bucket per provider per UTC day. */
function dayKey(providerKey: string, now: Date): string {
    return `${providerKey}:day:${now.toISOString().slice(0, 10)}`
}

export const __testing = { secondKey, dayKey }
