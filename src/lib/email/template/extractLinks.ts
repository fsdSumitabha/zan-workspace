/**
 * Collects every host a template links to.
 *
 * ## What this list is for
 *
 * It is the click redirect's allow-list, and it is the whole reason open
 * redirect is closed. `/api/e/c/[token]?u=...` will only ever send a reader
 * to a host that was in the compiled HTML of the template version the
 * campaign pinned. A URL that was never in the template cannot be reached
 * through our redirect, whatever the query string says and whoever signed
 * it.
 *
 * Because the list is built from the compiled output at save time, it
 * cannot be edited later without creating a new version, and a campaign
 * points at one version.
 *
 * ## Why hosts and not whole URLs
 *
 * Merge tokens and tracking parameters change the path and the query at
 * send time, so matching whole URLs would reject legitimate links. The host
 * is the part that decides where a reader actually lands.
 */

/**
 * Anchors only, deliberately.
 *
 * A plain `href=` match also catches `<link rel="stylesheet">`, which MJML
 * adds to every email for Google Fonts. That would put fonts.googleapis.com
 * in the click allow-list, where it has no business: nobody clicks a
 * stylesheet. The allow-list should hold exactly the hosts a reader can
 * reach by clicking, and nothing else.
 */
const HREF = /<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi

/** Schemes that are fine in an email and need no redirect at all. */
const IGNORED_SCHEMES = /^(mailto:|tel:|sms:|#)/i

export function extractLinkHosts(html: string): string[] {
    const hosts = new Set<string>()

    for (const match of html.matchAll(HREF)) {
        const raw = match[1].trim()

        if (!raw || IGNORED_SCHEMES.test(raw)) continue

        // A link whose host is a merge token cannot be checked here. It is
        // skipped, which means the redirect will refuse it later. That is
        // the safe direction: a link we cannot verify does not get an
        // exemption.
        if (raw.includes("{{")) continue

        try {
            const url = new URL(raw)
            if (url.protocol !== "http:" && url.protocol !== "https:") continue
            hosts.add(url.hostname.toLowerCase())
        } catch {
            // Relative or malformed. Nothing to allow.
        }
    }

    return Array.from(hosts).sort()
}

/**
 * Every absolute http(s) link in the template, for the "links in this
 * email" list on the campaign report.
 */
export function extractLinks(html: string): string[] {
    const links = new Set<string>()

    for (const match of html.matchAll(HREF)) {
        const raw = match[1].trim()
        if (!raw || IGNORED_SCHEMES.test(raw) || raw.includes("{{")) continue

        try {
            const url = new URL(raw)
            if (url.protocol === "http:" || url.protocol === "https:") {
                links.add(url.toString())
            }
        } catch {
            // Not absolute.
        }
    }

    return Array.from(links).sort()
}

/**
 * Whether a host is allowed by a template version's list.
 *
 * An exact match, or a subdomain of an allowed host. Subdomains are
 * allowed because a tracked link often resolves to a CDN or a regional
 * host under the same domain, and refusing those would break real links.
 * It never widens past the registered domain in the template.
 */
export function hostAllowed(host: string, allowed: string[]): boolean {
    const h = host.toLowerCase()
    return allowed.some((a) => {
        const base = a.toLowerCase()
        return h === base || h.endsWith(`.${base}`)
    })
}
