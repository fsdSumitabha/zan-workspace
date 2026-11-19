import { DirectQueueAdapter } from "./direct"
import type { QueueAdapter } from "./types"

export type { QueueAdapter, QueueSignal, EnqueueOptions } from "./types"

/**
 * Picks the queue adapter from the environment.
 *
 * EMAIL_QUEUE_ADAPTER is "direct" by default, which calls our own worker
 * route and needs no other service. See direct.ts for why that is enough
 * at this size.
 *
 * To add QStash later: write a QStashQueueAdapter against the same
 * interface, add it to the switch, set the variable. Nothing above this
 * file changes, because nothing above it knows which adapter it has.
 */

let cached: QueueAdapter | null = null

export function getQueue(): QueueAdapter {
    if (cached) return cached

    const choice = (process.env.EMAIL_QUEUE_ADAPTER ?? "direct")
        .trim()
        .toLowerCase()

    switch (choice) {
        case "direct":
            cached = new DirectQueueAdapter()
            break
        default:
            console.warn(
                `[email] unknown EMAIL_QUEUE_ADAPTER "${choice}". Using direct.`
            )
            cached = new DirectQueueAdapter()
    }

    return cached
}

/** For tests, which swap in a recording adapter. */
export function setQueue(adapter: QueueAdapter | null): void {
    cached = adapter
}
