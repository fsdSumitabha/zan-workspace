import type { z } from "zod"
import dbConnect from "@/lib/db/dbConnect"
import { enterRegionContext } from "@/lib/region-scope"
import { checkRateLimit } from "@/lib/security/rateLimit"
import { integrationActorId } from "./actor"
import { authenticateSite } from "./auth"
import { parseContract, type EnvelopeBody } from "./contract"
import { errorResponse, IntegrationError, readJsonBody, refuseBrowserCall, succeed } from "./http"
import { claimRequest, completeRequest, releaseRequest } from "./receipt"
import { SITE_CALLS_PER_HOUR, type IntegrationSite } from "./sites"

const HOUR_MS = 60 * 60 * 1000

export type IntegrationKind = "lead" | "newsletter"

/**
 * What both /api/integrations routes do, in this order:
 *
 *   1. Refuse a call from a browser (403).
 *   2. Find the website by its key (401, or 503 when no key is set up), and
 *      the bot user its records are written as (503 when that is not set).
 *   3. Count the call against that website's hourly limit (429).
 *   4. Read and check the body (415, 413, 400).
 *   5. Check the body's source and region against the key (403).
 *   6. Claim the request id, so a retry does not save twice (409 while the
 *      first attempt is still working; the first answer once it is done).
 *   7. Save the record in the body's region.
 *
 * A failure after step 6 releases the claim, so the website's retry can
 * save the record.
 */
export async function handleIntegrationPost<B extends EnvelopeBody>(
    req: Request,
    kind: IntegrationKind,
    schema: z.ZodType<B>,
    receive: (
        site: IntegrationSite,
        body: B,
        actorId: string
    ) => Promise<{ status: string; result?: string; created?: boolean }>
): Promise<Response> {
    let claimed: { site: string; id: string } | null = null

    try {
        refuseBrowserCall(req)
        const site = authenticateSite(req)
        const actorId = integrationActorId()

        // Per website and per route, so a flood of sign-ups cannot block
        // leads. In memory, like the other public routes' limits.
        const limit = checkRateLimit(`integration:${site.id}:${kind}`, SITE_CALLS_PER_HOUR, HOUR_MS)
        if (!limit.allowed) {
            throw new IntegrationError("Too many requests.", 429, undefined, {
                "Retry-After": String(limit.retryAfterSec),
            })
        }

        const body = parseContract(schema, await readJsonBody(req))

        if (body.source !== site.id) {
            throw new IntegrationError(
                `This key belongs to ${site.id}, but the body says it is from "${body.source}".`,
                403
            )
        }
        if (!site.regions.includes(body.region)) {
            throw new IntegrationError(`${site.id} cannot send records for the ${body.region} region.`, 403)
        }

        const idempotencyKey = req.headers.get("idempotency-key")
        if (idempotencyKey !== null && idempotencyKey !== body.id) {
            throw new IntegrationError("Idempotency-Key must be the same as the body's id.", 400)
        }

        await dbConnect()

        const claim = await claimRequest(site.id, body.id, kind)
        if (claim.kind === "done") return succeed(claim.status)
        if (claim.kind === "busy") throw new IntegrationError("This request is already being saved.", 409)
        claimed = { site: site.id, id: body.id }

        // Nobody is signed in, so there is no region scope yet. The body's
        // region, already checked against the key, is the scope: reads see
        // that region only, new records are stamped with it, and only that
        // region's team is notified.
        enterRegionContext({ regions: [body.region], writeRegion: body.region })

        const outcome = await receive(site, body, actorId)

        try {
            await completeRequest(site.id, body.id, outcome.status)
        } catch (error) {
            // The record is saved. A retry would find its lead or contact.
            console.error(`[integrations] ${kind} receipt not closed:`, error instanceof Error ? error.message : error)
        }
        claimed = null

        // Never a name or an address: logs are no place for them.
        const what = outcome.result ?? (outcome.created === false ? "added to an existing lead" : "new lead")
        console.log(`[integrations] ${kind} from ${site.id} (${body.region}, ${body.form}): ${what}`)

        return succeed(outcome.status)
    } catch (error) {
        if (claimed) {
            await releaseRequest(claimed.site, claimed.id).catch((releaseError) =>
                console.error(
                    `[integrations] ${kind} claim not released:`,
                    releaseError instanceof Error ? releaseError.message : releaseError
                )
            )
        }
        return errorResponse(error, kind)
    }
}
