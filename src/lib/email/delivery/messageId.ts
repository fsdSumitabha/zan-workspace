import type { Types } from "mongoose"

/**
 * The Message-ID we put on every outgoing email.
 *
 * ## Why we generate it instead of letting the server
 *
 * It is written to MongoDB BEFORE the send, not after. If a worker is
 * killed between the SMTP accept and the database write, this id is still
 * on the recipient row, and it is the only handle we have on a message
 * whose outcome we do not know.
 *
 * With a provider that can look a message up by id, or that sends webhooks
 * carrying it, an UNKNOWN_OUTCOME can then be resolved for certain instead
 * of being a permanent question mark. See
 * docs/EMAIL_MARKETING_ARCHITECTURE.md section 6.7.
 *
 * ## It is deterministic
 *
 * The same (recipient, attempt) always produces the same id. Two workers
 * that somehow both sent the same attempt would produce one id, not two,
 * so the duplicate is at least visible in the provider's logs rather than
 * looking like two separate messages.
 *
 * The attempt number is part of it on purpose: a legitimate retry is a
 * genuinely different message and should not claim to be the first one.
 */
export function buildMessageId(input: {
    campaignId: Types.ObjectId | string
    recipientId: Types.ObjectId | string
    attempt: number
    /** The domain of the sending address. Must be a real domain we own. */
    sendingDomain: string
}): string {
    const domain = sanitizeDomain(input.sendingDomain)

    return `<cmp-${input.campaignId}-rcp-${input.recipientId}-a${input.attempt}@${domain}>`
}

/**
 * Reads our own ids back out of a Message-ID.
 *
 * The bounce webhook uses this: providers echo the Message-ID, and it maps
 * straight back to the recipient row with no extra lookup table.
 *
 * Returns null for anything that is not one of ours, including a
 * Message-ID a provider generated itself.
 */
export function parseMessageId(raw: string | undefined | null): {
    campaignId: string
    recipientId: string
    attempt: number
} | null {
    if (!raw) return null

    const match = raw.match(
        /^<?cmp-([a-f0-9]{24})-rcp-([a-f0-9]{24})-a(\d+)@/i
    )

    if (!match) return null

    return {
        campaignId: match[1],
        recipientId: match[2],
        attempt: Number(match[3]),
    }
}

/**
 * The domain part of the sending address.
 *
 * A Message-ID with a bad domain is a spam signal, so the fallback is a
 * plain string rather than anything that could carry a space or a quote
 * into a mail header.
 */
export function sendingDomainOf(fromEmail: string | undefined): string {
    const at = (fromEmail ?? "").lastIndexOf("@")
    if (at < 0) return "localhost"
    return sanitizeDomain(fromEmail!.slice(at + 1))
}

function sanitizeDomain(domain: string): string {
    const clean = domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "")
    return clean || "localhost"
}
