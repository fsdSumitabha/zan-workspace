import EmailDispatchLock from "@/models/EmailDispatchLock"
import { runWithoutRegionScope } from "@/lib/region-scope"
import {
    deliverySettings,
    schedulePrecisionMinutes,
} from "@/lib/email/config/deliveryConfig"
import { LOCK_ID } from "./dispatcher"

/**
 * Whether anything is actually driving the scheduler.
 *
 * ## Why this is needed
 *
 * Scheduling a campaign writes a row and waits. If nothing ever calls
 * `/api/jobs/email/dispatch`, the campaign sits at "Scheduled" for ever
 * and the screen looks completely normal. Nothing fails, so nothing is
 * reported.
 *
 * That is easy to end up with. `vercel.json` declares one cron a day,
 * because Hobby allows one a day, and the docs call it a backstop rather
 * than a scheduler. A campaign set for 16:20 does not go out at 16:20.
 * And if `CRON_SECRET` is not set on the project, Vercel's own request is
 * refused and the dispatcher never runs at all.
 *
 * See docs/EMAIL_MARKETING_SCHEDULING.md for the three ways to drive it.
 *
 * ## Where the time comes from
 *
 * The dispatcher claims a lock on every invocation, busy or idle, so the
 * lock's `updatedAt` is the last time it ran. No new bookkeeping, and it
 * cannot drift from the truth.
 */

export interface SchedulerHealth {
    /** When the dispatcher last ran, or null if it never has. */
    lastRunAt: string | null
    /** How late a scheduled campaign may be before something is wrong. */
    expectedWithinMinutes: number
}

export async function schedulerHealth(): Promise<SchedulerHealth> {
    // The lock is one document for the whole deployment and carries no
    // region, so it is read the same way the dispatcher writes it.
    const lock = await runWithoutRegionScope(() =>
        EmailDispatchLock.findById(LOCK_ID)
            .select("updatedAt")
            .lean<{ updatedAt?: Date }>()
    )

    return {
        lastRunAt: lock?.updatedAt ? lock.updatedAt.toISOString() : null,
        expectedWithinMinutes: schedulePrecisionMinutes(deliverySettings()),
    }
}
