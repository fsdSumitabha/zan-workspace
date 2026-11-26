import IntegrationReceipt from "@/models/IntegrationReceipt"
import { isDuplicateKeyError } from "./http"

/**
 * Makes a repeated request safe.
 *
 * A website sends each record with an id, and sends the same id again on a
 * retry. The first attempt claims the id with a row. A repeat then gets one
 * of three answers:
 *
 *   done     the first attempt finished: answer what it answered
 *   busy     the first attempt is still working: answer 409, which the
 *            website counts as received
 *   claimed  nobody has it, or the first attempt went quiet for a minute
 *            (its function was stopped): this attempt does the work
 *
 * A failed attempt releases its claim, so the retry can do the work again.
 */

/** How long a claim holds before another attempt may take it over. */
const STALE_MS = 60_000

export type Claim =
    | { kind: "claimed" }
    | { kind: "done"; status: string }
    | { kind: "busy" }

export async function claimRequest(
    site: string,
    requestId: string,
    kind: "lead" | "newsletter",
    now: Date = new Date()
): Promise<Claim> {
    // Twice at most: the second time is for a claim that was released
    // between our insert and our read.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await IntegrationReceipt.create({ site, requestId, kind, state: "processing", claimedAt: now })
            return { kind: "claimed" }
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error
        }

        const takenOver = await IntegrationReceipt.findOneAndUpdate(
            { site, requestId, state: "processing", claimedAt: { $lt: new Date(now.getTime() - STALE_MS) } },
            { $set: { claimedAt: now } }
        )
        if (takenOver) return { kind: "claimed" }

        const existing = await IntegrationReceipt.findOne({ site, requestId }).lean()
        if (existing?.state === "done") return { kind: "done", status: existing.status ?? "received" }
        if (existing) return { kind: "busy" }
    }
    return { kind: "busy" }
}

export async function completeRequest(site: string, requestId: string, status: string): Promise<void> {
    await IntegrationReceipt.updateOne({ site, requestId }, { $set: { state: "done", status } })
}

export async function releaseRequest(site: string, requestId: string): Promise<void> {
    await IntegrationReceipt.deleteOne({ site, requestId, state: "processing" })
}
