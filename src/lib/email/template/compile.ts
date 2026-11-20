import mjml2html from "mjml"
import { EmailError } from "@/lib/email/http"
import {
    GMAIL_CLIP_BYTES,
    MAX_HTML_BYTES,
    validateMjmlSource,
} from "./validate"
import { sanitizeEmailHtml } from "./sanitize"
import { extractLinkHosts } from "./extractLinks"
import { findMergeTokens } from "@/lib/email/personalise/tokens"
import { normaliseMjml } from "./normalise"

/**
 * Compiles MJML to the HTML we actually send.
 *
 * ## Why the server compiles again
 *
 * The browser compiles too, with mjml-browser, for the live preview. That
 * compile is for the designer's eyes. This one produces the bytes that go
 * to real people, and the client is never trusted to produce those. If the
 * two ever disagree, this one wins and the save is refused with the errors
 * shown.
 *
 * Both sides are pinned to the 4.18 line so they agree in the first place.
 * `grapesjs-mjml@1.0.8` pulls `mjml-browser@^4.18.0`; package.json pins
 * `mjml@4.18.0` exactly. Do not let these drift.
 *
 * ## The two options that are off on purpose
 *
 * `minify` runs html-minifier, which has an unfixed REDoS in every version
 * at or below 4.0.0 (GHSA-pfq8-rq6v-vf5m). Our emails are a few tens of
 * kilobytes and minifying saves almost nothing, so the feature is not worth
 * a denial of service on a route that accepts author input. Off.
 *
 * `beautify` runs js-beautify, which carries its own advisory and is purely
 * cosmetic for bytes nobody reads by hand. Off.
 *
 * Together with the `mj-include` rejection in validate.ts, nothing we pass
 * to MJML reaches a vulnerable code path.
 */

export interface CompileResult {
    /**
     * The source, made safe for an XML parser. Store THIS, not what was
     * sent in. It is what the editor has to be able to reopen, and it
     * says exactly the same thing. See ./normalise.ts.
     */
    mjml: string
    html: string
    text: string
    /** Hosts found in the HTML. The click redirect's allow-list. */
    linkHosts: string[]
    /** Merge tokens this template uses, for the personalisation step. */
    mergeTokens: string[]
    /** Non-fatal messages from MJML, plus our own notes. */
    warnings: string[]
    htmlBytes: number
}

interface MjmlError {
    line?: number
    message?: string
    tagName?: string
}

/**
 * Validates, compiles, sanitises and measures. Throws EmailError with
 * readable messages when the source cannot be used.
 */
export function compileMjml(source: string): CompileResult {
    // Before anything else, so the compiled HTML and the stored source
    // come from the same text. The editor parses this again later with a
    // stricter parser than MJML's; normalise.ts explains what that costs
    // when it is skipped.
    const mjml = normaliseMjml(source)

    const { warnings } = validateMjmlSource(mjml)

    let raw: { html: string; errors?: MjmlError[] }

    try {
        raw = mjml2html(mjml, {
            // Strict: a tag MJML does not recognise is an error, not a
            // silent drop. A designer would rather be told.
            validationLevel: "strict",
            // See the note above. Both stay off.
            minify: false,
            beautify: false,
            // No file path. Nothing may resolve against the filesystem, and
            // validate.ts has already refused the only tag that tries.
            filePath: undefined,
        })
    } catch (error) {
        throw new EmailError(describeMjmlFailure(error), 400, { field: "mjml" })
    }

    for (const e of raw.errors ?? []) {
        warnings.push(
            e.line ? `Line ${e.line}: ${e.message ?? "problem"}` : String(e.message)
        )
    }

    if (!raw.html || !raw.html.trim()) {
        throw new EmailError(
            "MJML compiled to an empty email. Check that there is an " +
            "<mj-body> with something inside it.",
            400,
            { field: "mjml" }
        )
    }

    const html = sanitizeEmailHtml(raw.html)
    const htmlBytes = Buffer.byteLength(html, "utf8")

    if (htmlBytes > MAX_HTML_BYTES) {
        throw new EmailError(
            `The compiled email is ${Math.round(htmlBytes / 1024)} KB, over the ` +
            `${MAX_HTML_BYTES / 1024 / 1024} MB limit.`,
            400,
            { field: "mjml" }
        )
    }

    if (htmlBytes > GMAIL_CLIP_BYTES) {
        warnings.push(
            `This email is ${Math.round(htmlBytes / 1024)} KB. Gmail hides ` +
            "anything past about 102 KB behind a 'View entire message' link, " +
            "including the unsubscribe footer. Consider shortening it."
        )
    }

    return {
        mjml,
        html,
        text: htmlToText(html),
        linkHosts: extractLinkHosts(html),
        mergeTokens: findMergeTokens(mjml),
        warnings,
        htmlBytes,
    }
}

/**
 * MJML throws a plain Error whose message is often a wall of stack. Keep
 * the first useful line, and never show a filesystem path.
 */
function describeMjmlFailure(error: unknown): string {
    if (!(error instanceof Error)) return "The template could not be compiled."

    const first = error.message.split("\n").find((l) => l.trim()) ?? error.message

    // MJML includes absolute paths in some messages. Those say nothing to a
    // designer and they describe our server, so strip them.
    const clean = first.replace(/(?:[A-Za-z]:)?[\\/][^\s]*[\\/]/g, "")

    return `The template could not be compiled. ${clean.trim()}`
}

/**
 * A plain-text alternative, built from the compiled HTML.
 *
 * Every email we send carries one. A message with no text part scores worse
 * with spam filters, and some clients and screen readers use it.
 *
 * This is intentionally simple. It is not a Markdown renderer; it keeps
 * link targets visible and drops the rest of the markup.
 */
export function htmlToText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        // Keep the target of a link next to its text.
        .replace(
            /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
            (_m, href, text) => {
                const label = String(text).replace(/<[^>]+>/g, "").trim()
                return label && label !== href ? `${label} (${href})` : String(href)
            }
        )
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, " ")
        // Drop lines that are only whitespace. MJML's table layout leaves a
        // lot of them, and without this the text part is mostly blank lines.
        .replace(/^[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}
