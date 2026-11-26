import { createHash, timingSafeEqual } from "crypto"
import { INTEGRATION_SITES, MIN_SITE_KEY_LENGTH, type IntegrationSite } from "./sites"
import { IntegrationError } from "./http"

/**
 * Which website a request is from, by its key.
 *
 * The key travels as `Authorization: Bearer <key>`, the same header the
 * websites already use for every call to zan-workspace. Each website has a
 * key of its own (INTEGRATION_SITES[].keyEnv), so the key alone says which
 * website is calling.
 *
 * Both sides are hashed before the compare. That gives two buffers of the
 * same length, so timingSafeEqual never throws and the time taken does not
 * depend on the length of the key that was sent. Every configured key is
 * compared, so it does not depend on which key matched either.
 */

function digest(value: string): Buffer {
    return createHash("sha256").update(value, "utf8").digest()
}

type Env = Record<string, string | undefined>

/** The website's key, or null when it is not set or too short to be safe. */
export function siteKey(site: IntegrationSite, env: Env = process.env): string | null {
    const key = env[site.keyEnv]?.trim()
    return key && key.length >= MIN_SITE_KEY_LENGTH ? key : null
}

/** The key from `Authorization: Bearer <key>`, or null. */
export function bearerToken(req: Request): string | null {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "")
    return match ? match[1] : null
}

/**
 * The website that holds this key, or null.
 *
 * Throws 503 when no website has a key, and when two websites have the same
 * one. With one shared key there is no telling the websites apart, and one
 * could write into the other's regions.
 */
export function siteForKey(given: string, env: Env = process.env): IntegrationSite | null {
    const configured = INTEGRATION_SITES.map((site) => ({ site, key: siteKey(site, env) })).filter(
        (entry): entry is { site: IntegrationSite; key: string } => entry.key !== null
    )

    if (configured.length === 0) {
        console.error(
            "[integrations] No website key is set. Set " +
            INTEGRATION_SITES.map((s) => s.keyEnv).join(" and ") +
            " (at least 32 characters each)."
        )
        throw new IntegrationError("Website integrations are not set up.", 503)
    }

    if (new Set(configured.map((entry) => entry.key)).size !== configured.length) {
        console.error("[integrations] Two websites have the same key. Each website needs its own key.")
        throw new IntegrationError("Website integrations are not set up.", 503)
    }

    const sent = digest(given)
    let match: IntegrationSite | null = null
    for (const { site, key } of configured) {
        if (timingSafeEqual(sent, digest(key)) && !match) match = site
    }
    return match
}

/**
 * The calling website. Throws 401 for a missing or unknown key, and 503
 * when the keys are not set up (siteForKey).
 */
export function authenticateSite(req: Request): IntegrationSite {
    // An empty string matches no key, so a request without one gets 401.
    const site = siteForKey(bearerToken(req) ?? "")
    if (!site) throw new IntegrationError("Unauthorised.", 401)
    return site
}
