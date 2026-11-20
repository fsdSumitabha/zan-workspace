import { UNKNOWN_OUTCOME_POLICY } from "@/constants/emailStatus"

/**
 * Every operating number the delivery engine uses, decided here.
 *
 * ## Why they are in code
 *
 * These are not preferences. Each one is derived from a limit somebody else
 * imposes: Gmail's, Vercel's, or what this application was measured doing.
 * A person guessing at them on a settings screen can only make things
 * worse, and a wrong value is not obvious until a campaign is halfway out.
 *
 * So they are constants, they are explained, and changing one is a code
 * change that goes through review.
 *
 * ## What they were derived from
 *
 * - **Vercel Hobby**: 1 vCPU, 2 GB memory, 300 seconds maximum function
 *   duration with Fluid Compute.
 * - **Gmail Workspace**: 2,000 messages a day per user. The sales mailbox
 *   also sends quotations, so campaigns cannot have all of it.
 * - **Measured on this project**, 19 November 2026: 300 recipients against
 *   a remote MongoDB Atlas cluster through a mail sink. At a send
 *   concurrency of 2 the run managed 3.87 per second and used 39% of a 10
 *   per second allowance. Three database writes per recipient dominate;
 *   the sending itself does not.
 * - **Real volume**: campaigns of under 100 recipients.
 *
 * The full table is in docs/email-marketing-operations.md section 6.
 */

export interface DeliverySettings {
    /* --- The provider's limits --- */
    globalPerSecond: number
    globalPerDay: number
    maxConnections: number
    maxMessages: number

    /* --- How a worker paces itself --- */
    logicalBatchSize: number
    maxJobsPerInvocation: number
    sendConcurrency: number
    workerDurationBudgetMs: number
    workerSafetyFraction: number
    leaseDurationMs: number

    /* --- Retrying --- */
    maxAttemptsTransient: number
    maxAttemptsPermanent: number
    backoffBaseMs: number
    backoffMaxMs: number

    /* --- Safety --- */
    globalCampaignConcurrency: number
    unknownOutcomePolicy: number
    unknownOutcomeWindowMs: number
    suppressionRecheckBeforeSend: boolean
    heartbeatIntervalMinutes: number
    bounceRateThreshold: number
    bounceRateMinSample: number
}

export const DELIVERY_LIMITS: Readonly<DeliverySettings> = Object.freeze({
    /**
     * A backstop, not a target.
     *
     * Measured throughput at the concurrency below is 3.87 a second, so
     * this never slows a real campaign. It is here to stop one runaway
     * process, and it is enforced globally by the counters in
     * rateLimiter.ts rather than per worker.
     *
     * Gmail publishes no per-second SMTP figure. Ten over a single pooled
     * connection is modest by any reading of its guidance.
     */
    globalPerSecond: 10,

    /**
     * Half of what Gmail Workspace allows one account in a day.
     *
     * The other half is deliberately left alone. The sales mailbox also
     * sends quotations, and those do not pass through this limiter, so
     * campaigns must not be able to spend the whole allowance. Hitting
     * Gmail's real limit blocks the account for 24 hours, which would stop
     * quotations as well as campaigns.
     *
     * At the real volume this is ten campaigns a day. It exists to catch a
     * loop, not to ration normal use.
     */
    globalPerDay: 1_000,

    /**
     * One connection, on purpose.
     *
     * Providers cap concurrent connections per account, and exceeding the
     * cap gets the account throttled rather than failing cleanly. The pool
     * is also per process, so a warm instance multiplies whatever is set
     * here.
     */
    maxConnections: 1,

    /** Messages down one connection before it is rebuilt. */
    maxMessages: 100,

    /** Recipients grouped together for progress reporting. */
    logicalBatchSize: 100,

    /**
     * The most recipients one worker claims at a time.
     *
     * At 100, a campaign of 100 is a single claim in a single invocation,
     * which is the common case here. Higher would mean a crash loses more
     * progress for no gain.
     */
    maxJobsPerInvocation: 100,

    /**
     * Sends in flight inside one worker.
     *
     * Measured, and left where the measurement put it. At 2 a campaign used
     * 39% of the permitted rate, so the rate limit was never the
     * constraint: the database round trips were. Raising it to 6 or 10 only
     * helped against a sink, which has no connection limit. Real SMTP
     * queues behind the single pooled connection above, so the gain would
     * be far smaller than a benchmark suggests.
     *
     * A campaign of 100 finishes in about 27 seconds at this value.
     */
    sendConcurrency: 2,

    /**
     * 180 of Vercel's 300 seconds.
     *
     * The gap is not waste. It is what lets a worker stop claiming, finish
     * what is in flight, and write the results before the platform kills
     * the function.
     */
    workerDurationBudgetMs: 180_000,

    /**
     * Stop claiming at 70% of the budget, so 126 seconds in.
     *
     * That leaves 54 seconds of the budget for in-flight sends, and 120
     * seconds before the platform's own limit.
     */
    workerSafetyFraction: 0.7,

    /**
     * How long one worker holds a recipient before another may take it.
     *
     * Longer than any single send, including a slow one. Short enough that
     * a crashed worker's recipients are picked up again quickly.
     */
    leaseDurationMs: 120_000,

    /** Retries for a temporary failure, such as a timeout or a 421. */
    maxAttemptsTransient: 5,

    /** Always 1. A 550 does not get better by being retried. */
    maxAttemptsPermanent: 1,

    /** The first wait before a retry. It doubles, with full jitter. */
    backoffBaseMs: 2_000,

    /** The longest wait between retries. Fifteen minutes. */
    backoffMaxMs: 900_000,

    /**
     * One campaign sending at a time.
     *
     * Two campaigns share one send rate, so running them together makes
     * neither faster and makes both harder to reason about.
     */
    globalCampaignConcurrency: 1,

    /**
     * What to do when a worker died between the server accepting a message
     * and the database recording it.
     *
     * Never resend. A duplicate to a real person costs more than one person
     * not receiving it: duplicates are what get a sender marked as spam.
     */
    unknownOutcomePolicy: UNKNOWN_OUTCOME_POLICY.NEVER_RESEND,
    unknownOutcomeWindowMs: 3_600_000,

    /**
     * Check the suppression list again immediately before each send.
     *
     * Someone can unsubscribe between a campaign being scheduled and being
     * sent. One indexed lookup per recipient is a small price for not
     * emailing somebody who asked you to stop.
     */
    suppressionRecheckBeforeSend: true,

    /**
     * How often the scheduler actually runs, in minutes.
     *
     * This is a statement about the outside world, not a setting. It must
     * match whatever is wired up, because the campaign screen multiplies it
     * by two to tell people how late a scheduled campaign may go out.
     *
     * Vercel's own cron on the Hobby plan runs once a day, so this value
     * only holds if an external scheduler is calling the dispatch endpoint
     * every 15 minutes. See docs/EMAIL_MARKETING_SCHEDULING.md.
     */
    heartbeatIntervalMinutes: 15,

    /**
     * Stop a campaign when this share of sends hard bounce.
     *
     * Raised from 5%, and the sample below lowered, because together they
     * did nothing at this volume: a minimum sample of 100 meant the guard
     * never fired on a campaign of under 100 recipients.
     *
     * At 10% with a sample of 25, a campaign halts after 3 bounces in the
     * first 25, or 10 in a list of 100. One stale address in a small list
     * is normal and must not stop a send; three in twenty-five is a bad
     * list and should.
     */
    bounceRateThreshold: 0.1,

    /**
     * How many sends before the bounce guard applies.
     *
     * Small enough to fire on a campaign of 100, large enough that two
     * bounces out of three do not halt anything.
     */
    bounceRateMinSample: 25,
})

/**
 * Limits supplied by a test, used instead of the real ones.
 *
 * The seam exists because a test has to be able to force the engine into
 * states the real limits make rare: a rate limit of 1 a second, a worker
 * budget of 2 seconds, a batch of 3. Without it those paths could not be
 * exercised at all.
 *
 * Ignored unless NODE_ENV is not "production", so a stray call in deployed
 * code cannot quietly loosen a limit. Same arrangement as setTestTransport
 * in src/lib/email/delivery/transport.ts.
 */
let injected: Partial<DeliverySettings> | null = null

export function setTestLimits(limits: Partial<DeliverySettings> | null): void {
    if (process.env.NODE_ENV === "production") {
        throw new Error("setTestLimits must never be called in production.")
    }
    injected = limits
}

/**
 * The operating numbers.
 *
 * A function rather than the constant itself, because every caller used to
 * read these from the database per region and this keeps those call sites
 * honest about getting a snapshot. It takes no region: the limits are
 * Gmail's and Vercel's, and neither varies by region.
 */
export function deliverySettings(): DeliverySettings {
    if (injected && process.env.NODE_ENV !== "production") {
        return { ...DELIVERY_LIMITS, ...injected }
    }
    return { ...DELIVERY_LIMITS }
}

/**
 * One sentence per number, shown on the settings screen.
 *
 * The screen shows them read-only. They are there so somebody diagnosing a
 * slow campaign can see what the engine is actually doing without reading
 * the code.
 */
export const DELIVERY_FIELD_HELP: Record<keyof DeliverySettings, string> = {
    globalPerSecond:
        "The most emails a second across every worker. A backstop: measured " +
        "throughput is about 4 a second, so this does not slow anything.",
    globalPerDay:
        "The most campaign emails a day. Half of what Gmail allows the " +
        "account, so quotations and user mail always have room.",
    maxConnections:
        "Connections open to the mail server at once. One, because " +
        "providers throttle an account that opens more.",
    maxMessages: "Emails down one connection before it is rebuilt.",
    logicalBatchSize:
        "How many recipients are grouped together for progress reporting.",
    maxJobsPerInvocation:
        "The most recipients one worker takes at a time. A campaign of 100 " +
        "is a single claim.",
    sendConcurrency:
        "How many emails are in flight at once inside one worker. Measured " +
        "at this value; the database writes are the constraint, not the " +
        "sending.",
    workerDurationBudgetMs:
        "How long a worker keeps taking new work before it hands over to " +
        "the next one. The Vercel limit is 300 seconds.",
    workerSafetyFraction:
        "The worker stops taking new work at this share of its budget, so " +
        "emails already sending can finish and be recorded.",
    leaseDurationMs:
        "How long one worker holds a recipient before another may take it.",
    maxAttemptsTransient:
        "How many times to retry a temporary failure, such as a timeout.",
    maxAttemptsPermanent:
        "Attempts for a permanent failure, such as 'no such address'. " +
        "Always 1. Retrying does not help.",
    backoffBaseMs: "The first wait before a retry. It doubles each time.",
    backoffMaxMs: "The longest wait between retries.",
    globalCampaignConcurrency:
        "How many campaigns may send at the same time. They share one send " +
        "rate, so more campaigns does not mean more speed.",
    unknownOutcomePolicy:
        "What to do when a worker died mid-send and we cannot tell whether " +
        "the email went out. Not resending is the safe choice.",
    unknownOutcomeWindowMs:
        "Only used when the policy is to resend. How long to wait first.",
    suppressionRecheckBeforeSend:
        "Check the suppression list again immediately before each send. " +
        "Someone can unsubscribe between scheduling and sending.",
    heartbeatIntervalMinutes:
        "How often the scheduler runs. This decides how close to the chosen " +
        "time a scheduled campaign goes out, and it is what the campaign " +
        "screen tells people.",
    bounceRateThreshold:
        "Stop a campaign when this share of sends hard bounce. 0.1 is 10%.",
    bounceRateMinSample:
        "Only apply the bounce limit once this many emails have been sent, " +
        "so two bounces out of three do not stop a campaign.",
}

/**
 * Applies a campaign's own overrides on top of the limits.
 *
 * Overrides are rare and there is no screen for them. They exist so one
 * unusually large campaign can be slowed down from the database without a
 * deploy. They can only ever make a number different, never unsafe: the
 * rate limiter is still global and the kill switch still applies.
 */
export function withOverrides(
    base: DeliverySettings,
    overrides?: Map<string, number> | Record<string, number> | null
): DeliverySettings {
    if (!overrides) return base

    const entries =
        overrides instanceof Map
            ? Array.from(overrides.entries())
            : Object.entries(overrides)

    if (entries.length === 0) return base

    const merged = { ...base }

    for (const [key, value] of entries) {
        if (!(key in DELIVERY_LIMITS)) continue
        if (typeof value !== "number" || !Number.isFinite(value)) continue
        // Booleans are not overridable. There is no case for a campaign
        // that skips the suppression recheck.
        if (typeof merged[key as keyof DeliverySettings] === "boolean") continue

        // Through unknown: DeliverySettings holds one boolean, so it does
        // not line up with Record<string, number>. The guard above means
        // only number fields reach this line.
        ;(merged as unknown as Record<string, number>)[key] = value
    }

    return merged
}

/**
 * When a worker must stop claiming new work, in milliseconds from its own
 * start. The gap between this and the platform's hard limit is what lets
 * in-flight sends finish and write their results.
 */
export function claimDeadlineMs(settings: DeliverySettings): number {
    return Math.floor(settings.workerDurationBudgetMs * settings.workerSafetyFraction)
}

/**
 * How close to the chosen time a scheduled campaign will actually go out,
 * in minutes, as a number to show a person.
 *
 * The heartbeat interval is only half the story. Vercel's Hobby schedules
 * carry a jitter window as long as the interval itself, so a 15-minute
 * schedule can fire up to 30 minutes after the chosen time. We show the
 * worst case, because a promise that is usually right is worse than one
 * that is always right.
 */
export function schedulePrecisionMinutes(settings: DeliverySettings): number {
    return settings.heartbeatIntervalMinutes * 2
}
