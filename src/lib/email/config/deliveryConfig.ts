import type { RegionCode } from "@/lib/region"
import EmailDeliveryConfig, {
    type IEmailDeliveryConfig,
} from "@/models/EmailDeliveryConfig"
import { UNKNOWN_OUTCOME_POLICY } from "@/constants/emailStatus"

/**
 * Reads the delivery settings for a region, falling back to the defaults.
 *
 * Every number the delivery engine uses comes from here. Nothing under
 * src/lib/email hard-codes one. A worker reads this once per invocation
 * and passes the result down, so a settings change takes effect on the
 * next worker without a deploy.
 *
 * The defaults match the Vercel Hobby plan with campaigns of up to 100
 * recipients over Gmail SMTP. See docs/EMAIL_MARKETING_DECISIONS.md
 * section 3.
 */

export interface DeliverySettings {
    logicalBatchSize: number
    maxJobsPerInvocation: number
    sendConcurrency: number
    workerDurationBudgetMs: number
    workerSafetyFraction: number
    leaseDurationMs: number
    maxAttemptsTransient: number
    maxAttemptsPermanent: number
    backoffBaseMs: number
    backoffMaxMs: number
    globalCampaignConcurrency: number
    unknownOutcomePolicy: number
    unknownOutcomeWindowMs: number
    suppressionRecheckBeforeSend: boolean
    heartbeatIntervalMinutes: number
    bounceRateThreshold: number
    bounceRateMinSample: number
}

export const DELIVERY_DEFAULTS: DeliverySettings = {
    logicalBatchSize: 100,
    maxJobsPerInvocation: 100,
    sendConcurrency: 2,
    workerDurationBudgetMs: 180_000,
    workerSafetyFraction: 0.7,
    leaseDurationMs: 120_000,
    maxAttemptsTransient: 5,
    maxAttemptsPermanent: 1,
    backoffBaseMs: 2_000,
    backoffMaxMs: 900_000,
    globalCampaignConcurrency: 1,
    unknownOutcomePolicy: UNKNOWN_OUTCOME_POLICY.NEVER_RESEND,
    unknownOutcomeWindowMs: 3_600_000,
    suppressionRecheckBeforeSend: true,
    heartbeatIntervalMinutes: 15,
    bounceRateThreshold: 0.05,
    bounceRateMinSample: 100,
}

/**
 * One sentence per setting, shown under the field on the settings screen.
 *
 * It lives next to the defaults so the two cannot drift apart.
 */
export const DELIVERY_FIELD_HELP: Record<keyof DeliverySettings, string> = {
    logicalBatchSize:
        "How many recipients are grouped together for progress reporting.",
    maxJobsPerInvocation:
        "The most recipients one worker takes at a time. Higher is faster, " +
        "but a crash loses more progress.",
    sendConcurrency:
        "How many emails are in flight at once inside one worker. Above 2 " +
        "they just queue behind the single SMTP connection.",
    workerDurationBudgetMs:
        "How long a worker keeps taking new work before it hands over to the " +
        "next one. The Vercel limit is 300 seconds.",
    workerSafetyFraction:
        "The worker stops taking new work at this share of its budget, so " +
        "emails already sending can finish and be recorded.",
    leaseDurationMs:
        "How long one worker holds a recipient before another may take it. " +
        "Lower recovers faster from a crash, but risks taking live work.",
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
        "Someone can unsubscribe between scheduling and sending. Leave on.",
    heartbeatIntervalMinutes:
        "How often the scheduler runs. This decides how close to the chosen " +
        "time a scheduled campaign goes out, and it is what the campaign " +
        "screen tells people.",
    bounceRateThreshold:
        "Stop a campaign when this share of sends hard bounce. 0.05 is 5%.",
    bounceRateMinSample:
        "Only apply the bounce limit once this many emails have been sent, " +
        "so two bounces out of three do not stop a campaign.",
}

/**
 * The settings for a region. Creates the row with the defaults the first
 * time it is asked for, so there is nothing to seed.
 */
export async function getDeliverySettings(
    region: RegionCode
): Promise<DeliverySettings> {
    const row = await EmailDeliveryConfig.findOneAndUpdate(
        { region },
        { $setOnInsert: { region, ...DELIVERY_DEFAULTS } },
        { upsert: true, returnDocument: "after", new: true }
    ).lean<IEmailDeliveryConfig>()

    if (!row) return { ...DELIVERY_DEFAULTS }

    return pickSettings(row)
}

/**
 * Applies a campaign's own overrides on top of the region's settings.
 *
 * Overrides are rare. They exist so one unusually large campaign can be
 * slowed down without changing the setting for everything else.
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
        if (!(key in DELIVERY_DEFAULTS)) continue
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

function pickSettings(row: IEmailDeliveryConfig): DeliverySettings {
    const out = { ...DELIVERY_DEFAULTS }

    for (const key of Object.keys(DELIVERY_DEFAULTS) as (keyof DeliverySettings)[]) {
        const value = row[key as keyof IEmailDeliveryConfig]
        if (value === undefined || value === null) continue
        ;(out as Record<string, unknown>)[key] = value
    }

    return out
}
