/**
 * The queue, behind one interface.
 *
 * ## What a queue message is, and is not
 *
 * It is a wake-up signal: "look at campaign X". It carries no campaign
 * state and no recipient data. Everything the worker needs it reads from
 * MongoDB, which is the source of truth.
 *
 * That is deliberate, and it is what makes the whole design survive a
 * queue outage. If every message vanished right now, the next heartbeat
 * would find the campaign still SENDING with recipients still QUEUED and
 * carry on. Losing the queue costs latency, never correctness.
 *
 * It is also why a campaign scheduled six weeks out works: no queue
 * retains a message that long. Vercel Queues caps at 7 days and QStash's
 * free tier at 7 days. MongoDB holds the schedule instead.
 *
 * ## Adapters
 *
 * `direct` posts to our own worker route and needs no other service. At
 * 100 recipients a campaign finishes inside one function invocation, so
 * that is the production adapter on the Vercel Hobby plan.
 *
 * `qstash` is there for when volume grows. Nothing above this interface
 * changes when it is switched on.
 */

export interface QueueSignal {
    /** Which campaign to look at. */
    campaignId: string
    /** Set by a worker chaining its successor, for the log. */
    reason: "dispatch" | "chain" | "retry"
    /** Increments down a chain, so a runaway loop is visible. */
    hop: number
}

export interface EnqueueOptions {
    /** Seconds to wait before the worker runs. */
    delaySeconds?: number
    /**
     * Drops a repeat of the same key inside the provider's window.
     *
     * It reduces duplicate work; it does not prevent it. Every adapter is
     * at-least-once, so the worker has to be safe to run twice regardless,
     * which it is: claiming is atomic and a second worker simply finds
     * nothing to claim.
     */
    dedupeKey?: string
}

export interface QueueAdapter {
    readonly name: string
    /**
     * Asks for a worker to run. Resolves once the request is accepted, not
     * once the work is done.
     *
     * It must not throw for an ordinary failure. A queue that is down is a
     * delay, not a lost campaign: the next heartbeat picks the work up. It
     * returns false so the caller can log it.
     */
    enqueue(signal: QueueSignal, options?: EnqueueOptions): Promise<boolean>
}
