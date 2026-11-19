/**
 * Normalising and checking email addresses.
 *
 * Every address that enters the system goes through here: a lead's, a
 * client's, a pasted list, an imported spreadsheet. One place, so the
 * deduplication key is always built the same way.
 */

/** Why an address cannot be used. Mirrors the exclusion breakdown. */
export const ADDRESS_PROBLEM = {
    MISSING: "missing",
    INVALID: "invalid",
    ROLE: "role",
    BLOCKED_DOMAIN: "blocked_domain",
} as const

export type AddressProblem =
    (typeof ADDRESS_PROBLEM)[keyof typeof ADDRESS_PROBLEM]

/**
 * Deliberately not the full RFC 5322 grammar.
 *
 * The real grammar allows quoted strings, comments and addresses no mail
 * server in practice accepts. A regex that permissive catches nothing. This
 * one rejects what is actually wrong in a pasted list: no @, no dot in the
 * domain, spaces, two @s, a trailing comma.
 */
const SHAPE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[a-z]{2,24}$/i

/**
 * Mailboxes that belong to a function, not a person.
 *
 * Marketing mail to these is a common source of spam complaints, because
 * whoever reads `info@` did not sign up for anything. They are excluded by
 * default and the breakdown says so, rather than being silently dropped.
 */
const ROLE_LOCAL_PARTS = new Set([
    "abuse", "admin", "administrator", "billing", "compliance", "contact",
    "devnull", "ftp", "hello", "help", "hostmaster", "info", "inquiries",
    "legal", "mail", "marketing", "noc", "noreply", "no-reply", "office",
    "postmaster", "privacy", "root", "sales", "security", "spam", "support",
    "sysadmin", "unsubscribe", "webmaster",
])

/**
 * Domains that are never worth sending to.
 *
 * `example.com` and friends are reserved by RFC 2606 and exist in test
 * data. The throwaway providers are here because a bounce from one costs
 * sender reputation for a recipient who was never going to read it.
 */
const BLOCKED_DOMAINS = new Set([
    "example.com", "example.net", "example.org", "test.com", "localhost",
    "mailinator.com", "guerrillamail.com", "10minutemail.com",
    "tempmail.com", "throwawaymail.com", "yopmail.com", "trashmail.com",
])

export interface NormalizedAddress {
    /** As it was given, trimmed. Shown in the UI. */
    original: string
    /** Lowercase and trimmed. The deduplication key and the stored value. */
    normalized: string
    domain: string
    localPart: string
}

/**
 * Lowercases and trims. Nothing else.
 *
 * In particular it does NOT strip a `+tag`. `a+news@x.com` is a real,
 * separate mailbox at most providers, and people use tags precisely so they
 * can filter. Treating it as the same address as `a@x.com` would merge two
 * recipients and send one of them nothing.
 *
 * It does not lowercase the local part separately either. The RFC says the
 * local part is case sensitive, but no provider in practice treats it that
 * way, and leaving case alone would let `A@x.com` and `a@x.com` both
 * receive the same campaign.
 */
export function normalizeAddress(raw: unknown): NormalizedAddress | null {
    if (typeof raw !== "string") return null

    const original = raw.trim()
    if (!original) return null

    // A pasted list often carries "Name <addr@x.com>".
    const angled = original.match(/<([^>]+)>\s*$/)
    const bare = (angled ? angled[1] : original).trim()

    const normalized = bare.toLowerCase()
    const at = normalized.lastIndexOf("@")

    if (at < 1) {
        return { original, normalized, domain: "", localPart: normalized }
    }

    return {
        original,
        normalized,
        localPart: normalized.slice(0, at),
        domain: normalized.slice(at + 1),
    }
}

/**
 * What is wrong with an address, or null when it can be used.
 *
 * No MX lookup. It would mean a DNS round trip per address, which is far
 * too slow when building a list, and a domain with no MX today may have one
 * tomorrow. A bounce tells us the truth, and the bounce handler records it
 * in the suppression list.
 */
export function checkAddress(
    address: NormalizedAddress | null,
    options: { allowRoleAddresses?: boolean } = {}
): AddressProblem | null {
    if (!address || !address.normalized) return ADDRESS_PROBLEM.MISSING
    if (!SHAPE.test(address.normalized)) return ADDRESS_PROBLEM.INVALID
    if (BLOCKED_DOMAINS.has(address.domain)) return ADDRESS_PROBLEM.BLOCKED_DOMAIN

    if (!options.allowRoleAddresses && ROLE_LOCAL_PARTS.has(address.localPart)) {
        return ADDRESS_PROBLEM.ROLE
    }

    return null
}

/** Normalise and check in one step. */
export function readAddress(
    raw: unknown,
    options: { allowRoleAddresses?: boolean } = {}
): { address: NormalizedAddress | null; problem: AddressProblem | null } {
    const address = normalizeAddress(raw)
    return { address, problem: checkAddress(address, options) }
}

/**
 * Pulls addresses out of text somebody pasted.
 *
 * Accepts commas, semicolons, newlines and tabs as separators, and the
 * "Name <addr>" form, because that is what comes out of a mail client when
 * somebody copies a To field.
 */
export function splitPastedAddresses(text: string): string[] {
    return text
        .split(/[\n\r,;\t]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 5000)
}

/** The first word of a name, for {{first_name}}. */
export function firstNameOf(name: string | undefined | null): string {
    if (!name) return ""
    return name.trim().split(/\s+/)[0] ?? ""
}
