/**
 * The closed set of merge tokens a template may use.
 *
 * ## Why a fixed list and not a template engine
 *
 * Handlebars or similar would run author-supplied text as a program. The
 * variables here are known in advance and there are a dozen of them, so a
 * whitelist replacer does the same job with nothing to escape from. A token
 * that is not on this list is left in place and reported, rather than
 * silently resolving to something.
 *
 * ## Adding one
 *
 * Add it here, then make sure the audience snapshot fills it in
 * `mergeData`. The editor's token menu, the personalisation step and the
 * preview all read this list, so nothing else needs changing.
 */

export interface MergeToken {
    /** What goes inside the braces: {{first_name}}. */
    key: string
    label: string
    /** Shown in the editor menu and in the preview with no recipient. */
    sample: string
    /** What to print when a recipient has no value. Editable per campaign. */
    defaultFallback: string
    description: string
}

export const MERGE_TOKENS: readonly MergeToken[] = [
    {
        key: "first_name",
        label: "First name",
        sample: "Priya",
        defaultFallback: "there",
        description: "The first word of the contact's name.",
    },
    {
        key: "name",
        label: "Full name",
        sample: "Priya Sharma",
        defaultFallback: "there",
        description: "The contact's whole name.",
    },
    {
        key: "email",
        label: "Email address",
        sample: "priya@example.com",
        defaultFallback: "",
        description: "The address this copy is being sent to.",
    },
    {
        key: "company",
        label: "Company",
        sample: "Sharma Textiles",
        defaultFallback: "your company",
        description: "The company on the client record, or the lead's company.",
    },
    {
        key: "lead_source",
        label: "Lead source",
        sample: "Facebook",
        defaultFallback: "",
        description: "Where the lead came from.",
    },
    {
        key: "phone",
        label: "Phone",
        sample: "+91 98300 00000",
        defaultFallback: "",
        description: "The contact's phone number.",
    },
    {
        key: "owner_name",
        label: "Salesperson",
        sample: "Nadim",
        defaultFallback: "the Zan Services team",
        description: "The staff member this lead or client is assigned to.",
    },
    {
        key: "unsubscribe_url",
        label: "Unsubscribe link",
        sample: "https://example.com/e/u/sample",
        defaultFallback: "",
        description:
            "The one-click unsubscribe link. Every marketing email must " +
            "carry one. It is filled in at send time.",
    },
    {
        key: "postal_address",
        label: "Postal address",
        sample: "Zan Services, Kolkata, India",
        defaultFallback: "",
        description:
            "The sender identity's postal address. CAN-SPAM requires a real " +
            "one in every marketing email, so the default footer uses it.",
    },
] as const

export const MERGE_TOKEN_KEYS: readonly string[] = MERGE_TOKENS.map((t) => t.key)

/** Matches {{ token }}, with or without spaces inside the braces. */
export const TOKEN_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

export function isMergeToken(key: string): boolean {
    return MERGE_TOKEN_KEYS.includes(key.toLowerCase())
}

export function mergeToken(key: string): MergeToken | undefined {
    return MERGE_TOKENS.find((t) => t.key === key.toLowerCase())
}

/**
 * Every known token used in a piece of text, in the order they first
 * appear. Unknown tokens are not returned here; use `findUnknownTokens`.
 */
export function findMergeTokens(source: string): string[] {
    const found: string[] = []

    for (const match of source.matchAll(TOKEN_PATTERN)) {
        const key = match[1].toLowerCase()
        if (isMergeToken(key) && !found.includes(key)) found.push(key)
    }

    return found
}

/**
 * Tokens the author wrote that do not exist.
 *
 * These are a warning, not an error. A save is not blocked, because
 * `{{ }}` can legitimately appear in copy. The editor shows them so a typo
 * such as `{{firstname}}` is caught before 100 people read it.
 */
export function findUnknownTokens(source: string): string[] {
    const found: string[] = []

    for (const match of source.matchAll(TOKEN_PATTERN)) {
        const key = match[1].toLowerCase()
        if (!isMergeToken(key) && !found.includes(key)) found.push(key)
    }

    return found
}

/** The fallbacks every campaign starts with. */
export function defaultFallbacks(): Record<string, string> {
    return Object.fromEntries(
        MERGE_TOKENS.map((t) => [t.key, t.defaultFallback])
    )
}

/** Sample values, for a preview with no real recipient chosen. */
export function sampleMergeData(): Record<string, string> {
    return Object.fromEntries(MERGE_TOKENS.map((t) => [t.key, t.sample]))
}
