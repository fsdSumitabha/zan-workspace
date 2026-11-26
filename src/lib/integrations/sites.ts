import type { RegionCode } from "@/lib/region"

/**
 * The websites that send leads and newsletter sign-ups to zan-workspace.
 *
 * Each website has its own key. The key decides which website a request
 * is from. That in turn decides which regions it may write to, and the
 * source name its records get. The body's `source` must name the same
 * website, which catches a website that was set up with the other one's key.
 *
 * Every source name is made here, from the website's domain, and never
 * taken from the request:
 *   Lead.source                   "zanservices.com"
 *   EmailContact.consentSource    "form:zanservices.com/newsletter_form"
 *   EmailContact.tags             ["newsletter", "zanservices.com"]
 *
 * See docs/website-integrations.md.
 */

export interface IntegrationSite {
    /** Sent as `source` in every body. */
    id: string
    /** The website's own domain. It is the source name on everything it sends. */
    domain: string
    /** The regions this website serves. A body that names another region is refused. */
    regions: readonly RegionCode[]
    /** The environment variable that holds this website's key. */
    keyEnv: string
}

export const INTEGRATION_SITES: readonly IntegrationSite[] = [
    {
        id: "zanservices",
        domain: "zanservices.com",
        regions: ["IN", "US"],
        keyEnv: "ZANSERVICES_SITE_API_KEY",
    },
    {
        id: "zanverse-technologies",
        domain: "zanversetechnologies.com",
        regions: ["AE"],
        keyEnv: "ZANVERSE_TECHNOLOGIES_SITE_API_KEY",
    },
]

/** A shorter key is guessable. `openssl rand -hex 32` gives 64 characters. */
export const MIN_SITE_KEY_LENGTH = 32

/**
 * Calls each website may make to one route in an hour. Each website stops a
 * flood with its own lower limits first (40 leads and 100 sign-ups an hour),
 * and a retry can double a call, so this sits well above both.
 */
export const SITE_CALLS_PER_HOUR = 200

/** Tags every sign-up from a website gets, so audiences can pick them out. */
export function newsletterTags(site: IntegrationSite): string[] {
    return ["newsletter", site.domain]
}

/** Where a sign-up's consent came from: the website and its form. */
export function consentSourceOf(site: IntegrationSite, form: string): string {
    return `form:${site.domain}/${form}`
}
