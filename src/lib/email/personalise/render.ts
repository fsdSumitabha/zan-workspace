import { TOKEN_PATTERN, isMergeToken, mergeToken } from "./tokens"

/**
 * Fills merge tokens in a piece of text.
 *
 * One engine, used by the editor preview, the test send and the worker, so
 * what a designer sees is produced by the same code that sends the mail.
 *
 * ## Values are escaped
 *
 * A lead named `<script>alert(1)</script>` is a real thing that happens,
 * usually from a scraped list rather than an attack. Every value is HTML
 * escaped on the way in, so it renders as text and cannot close a tag. The
 * one exception is a value we generate ourselves, such as the unsubscribe
 * URL, which is marked raw by the caller.
 *
 * ## Unknown tokens are left alone
 *
 * `{{firstname}}` with no underscore is a typo, not an instruction. It is
 * left in place and reported in `unknown`, so the preview shows the author
 * exactly what a recipient would see. Blanking it would hide the mistake.
 */

export interface MergeRenderResult {
    text: string
    /** Known tokens that had no value and fell back. */
    missing: string[]
    /** Tokens that are not in MERGE_TOKENS at all. */
    unknown: string[]
}

export interface MergeInput {
    /** The recipient's values, from the campaign snapshot. */
    data: Record<string, string> | Map<string, string>
    /** Per-campaign overrides of each token's default fallback. */
    fallbacks?: Record<string, string> | Map<string, string>
    /**
     * Values that must not be escaped because we built them: today only
     * the unsubscribe URL. Anything a person typed never belongs here.
     */
    raw?: Record<string, string>
}

export function renderMerge(
    source: string,
    input: MergeInput
): MergeRenderResult {
    const data = toRecord(input.data)
    const fallbacks = toRecord(input.fallbacks)
    const raw = input.raw ?? {}

    const missing: string[] = []
    const unknown: string[] = []

    const text = source.replace(TOKEN_PATTERN, (whole, rawKey: string) => {
        const key = rawKey.toLowerCase()

        if (!isMergeToken(key)) {
            if (!unknown.includes(key)) unknown.push(key)
            return whole
        }

        if (key in raw) return raw[key]

        const value = data[key]
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return escapeHtml(String(value))
        }

        if (!missing.includes(key)) missing.push(key)

        const fallback =
            fallbacks[key] ?? mergeToken(key)?.defaultFallback ?? ""

        return escapeHtml(fallback)
    })

    return { text, missing, unknown }
}

/**
 * The same, for a plain-text body. Nothing is escaped, because there is no
 * markup to break, and escaping would show `&amp;` to the reader.
 */
export function renderMergeText(
    source: string,
    input: MergeInput
): MergeRenderResult {
    const data = toRecord(input.data)
    const fallbacks = toRecord(input.fallbacks)
    const raw = input.raw ?? {}

    const missing: string[] = []
    const unknown: string[] = []

    const text = source.replace(TOKEN_PATTERN, (whole, rawKey: string) => {
        const key = rawKey.toLowerCase()

        if (!isMergeToken(key)) {
            if (!unknown.includes(key)) unknown.push(key)
            return whole
        }

        if (key in raw) return raw[key]

        const value = data[key]
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return String(value)
        }

        if (!missing.includes(key)) missing.push(key)
        return fallbacks[key] ?? mergeToken(key)?.defaultFallback ?? ""
    })

    return { text, missing, unknown }
}

/**
 * A subject line. Same rules, except that a subject is plain text in the
 * mail header, so nothing is escaped and newlines are stripped.
 *
 * The newline strip is not cosmetic: a newline in a header is header
 * injection, and a value coming from a lead's name could carry one.
 */
export function renderSubject(
    source: string,
    input: MergeInput
): MergeRenderResult {
    const result = renderMergeText(source, input)
    return { ...result, text: result.text.replace(/[\r\n]+/g, " ").trim() }
}

function toRecord(
    value: Record<string, string> | Map<string, string> | undefined
): Record<string, string> {
    if (!value) return {}
    if (value instanceof Map) return Object.fromEntries(value.entries())
    return value
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}
