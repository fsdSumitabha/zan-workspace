import { encodeTarget, signTarget } from "./token"

/**
 * Rewrites an email's links through our redirect and adds the open pixel.
 *
 * Runs per recipient, just before the send, because every link has to
 * carry that recipient's token.
 *
 * ## What is deliberately left alone
 *
 * `mailto:`, `tel:` and anchors go through untouched: there is nothing to
 * track and rewriting them would break them.
 *
 * The unsubscribe link is left alone too, and this is the important one. A
 * reader who wants to unsubscribe must not have that routed through a
 * click tracker: it adds a step that can fail, and a failed unsubscribe is
 * the one failure that turns into a spam complaint.
 *
 * A link whose host is a merge token is left alone as well. It cannot be
 * checked against the template's allow-list, and the redirect would refuse
 * it at read time, which is worse than not tracking it.
 */

export interface InjectOptions {
    html: string
    /** The recipient's token, already on their row. */
    recipientToken: string
    /** Where our tracking routes live. */
    origin: string
    /** Off when the campaign or the provider has tracking disabled. */
    trackClicks: boolean
    trackOpens: boolean
}

export interface InjectResult {
    html: string
    /** Destinations in the order they were rewritten, for the report. */
    links: string[]
}

/** Matches an anchor's href. Only anchors: see extractLinks.ts. */
const ANCHOR_HREF = /(<a\b[^>]*?\shref\s*=\s*)(["'])(.*?)\2/gi

/** Schemes with nothing to track. */
const LEAVE_ALONE = /^(mailto:|tel:|sms:|#|data:)/i

export function injectTracking(options: InjectOptions): InjectResult {
    const base = options.origin.replace(/\/+$/, "")
    const links: string[] = []

    let html = options.html

    if (options.trackClicks) {
        html = html.replace(ANCHOR_HREF, (whole, prefix, quote, href) => {
            const target = String(href).trim()

            if (!target || LEAVE_ALONE.test(target)) return whole

            // A merge token in the URL cannot be signed now, because the
            // value is not known until it is rendered.
            if (target.includes("{{")) return whole

            // The unsubscribe link never goes through the tracker.
            if (target.includes("/e/u/")) return whole

            let url: URL
            try {
                url = new URL(target)
            } catch {
                // Relative or malformed. Nothing useful to redirect to.
                return whole
            }

            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return whole
            }

            const signature = signTarget(options.recipientToken, target)
            if (!signature) return whole

            links.push(target)

            const tracked =
                `${base}/api/e/c/${options.recipientToken}` +
                `?u=${encodeTarget(target)}&s=${signature}`

            return `${prefix}${quote}${tracked}${quote}`
        })
    }

    if (options.trackOpens) {
        const pixel =
            `<img src="${base}/api/e/o/${options.recipientToken}" ` +
            `width="1" height="1" alt="" ` +
            `style="display:block;width:1px;height:1px;border:0;" />`

        // Just inside </body> so it is the last thing loaded and cannot
        // push the layout around. Appended when there is no body tag,
        // which happens with a hand-written fragment.
        html = /<\/body>/i.test(html)
            ? html.replace(/<\/body>/i, `${pixel}</body>`)
            : html + pixel
    }

    return { html, links }
}

/**
 * The plain-text part.
 *
 * Links there are NOT rewritten. A tracking URL in plain text is a long
 * opaque string that looks like phishing, and the people most likely to
 * read the text part are the ones using a client that already strips the
 * tracking the HTML part would have done.
 */
export function injectTextTracking(text: string): string {
    return text
}
