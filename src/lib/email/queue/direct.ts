import type { EnqueueOptions, QueueAdapter, QueueSignal } from "./types"
import { jobEndpoint, jobSecret } from "@/lib/email/jobs/auth"

/**
 * The queue that is not a queue: an HTTP call to our own worker route.
 *
 * ## Why this is the production adapter here
 *
 * A campaign of up to 100 recipients at the configured rate finishes well
 * inside one function invocation. There is nothing to queue. Adding QStash
 * would mean another account, another token and another thing that can be
 * down, to solve a problem this size does not have.
 *
 * It is safe because MongoDB is the source of truth. A request that never
 * arrives costs latency only: the campaign is still SENDING with
 * recipients still QUEUED, and the next heartbeat finds it.
 *
 * ## Fire and forget, carefully
 *
 * A serverless function can be frozen as soon as it returns, which would
 * cut off an outbound request that had not finished. So this awaits the
 * response headers rather than abandoning the request, and the worker
 * route answers immediately and does its work after responding.
 *
 * A delay is honoured by waiting here only when it is short. A long delay
 * is left to the heartbeat, because holding a function open to sleep is
 * exactly the waste the whole design avoids.
 */

/** Longer than this and the heartbeat handles it instead of a sleep. */
const MAX_INLINE_DELAY_SECONDS = 5

export class DirectQueueAdapter implements QueueAdapter {
    readonly name = "direct"

    async enqueue(
        signal: QueueSignal,
        options: EnqueueOptions = {}
    ): Promise<boolean> {
        const url = jobEndpoint("work")
        const secret = jobSecret()

        if (!url || !secret) {
            console.error(
                "[email] cannot wake a worker: EMAIL_PUBLIC_ORIGIN or " +
                "EMAIL_JOB_SECRET is not set."
            )
            return false
        }

        const delay = options.delaySeconds ?? 0

        if (delay > 0 && delay <= MAX_INLINE_DELAY_SECONDS) {
            await new Promise((resolve) => setTimeout(resolve, delay * 1_000))
        } else if (delay > MAX_INLINE_DELAY_SECONDS) {
            // Leave it to the heartbeat. The campaign stays SENDING and the
            // next tick claims whatever is ready.
            return true
        }

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-job-secret": secret,
                },
                body: JSON.stringify(signal),
                // The worker answers before doing its work, so this returns
                // quickly. The timeout is a guard against a hung route, not
                // a limit on how long the work may take.
                signal: AbortSignal.timeout(20_000),
            })

            if (!res.ok) {
                console.error(
                    `[email] worker refused the signal: ${res.status}`
                )
                return false
            }

            return true
        } catch (error) {
            // Not fatal. See the note at the top.
            console.error("[email] could not reach the worker:", error)
            return false
        }
    }
}
