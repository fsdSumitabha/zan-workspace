import crypto from "crypto"

/**
 * Signing the links that go into an email.
 *
 * ## What the token is, and is not
 *
 * The path carries the recipient's `trackingToken`, which is itself an
 * HMAC written at snapshot time. It is not an ObjectId: a sequential id in
 * a URL invites somebody to try the next one, and a reversible one would
 * leak who was emailed to anyone who saw a link.
 *
 * The query carries the destination and a signature over it. The
 * signature stops somebody editing a real tracking link into a redirect to
 * their own site. The allow-list in the click route is the second, larger
 * guard: see extractLinks.ts.
 *
 * ## Why the signature is truncated
 *
 * 16 hex characters is 64 bits. Forging one needs about 2^63 guesses
 * against a route that is rate limited and returns the same answer for
 * every failure. The alternative is a 64-character signature in every link
 * of every email, which makes the HTML noticeably larger and some clients
 * wrap the URL.
 */

const SIGNATURE_LENGTH = 16

function secret(): string | null {
    const value = process.env.EMAIL_TRACKING_SECRET?.trim()
    return value && value.length >= 16 ? value : null
}

/** True when tracking can be signed at all. The settings screen reads it. */
export function trackingReady(): boolean {
    return secret() !== null
}

/**
 * Signs a destination for one recipient.
 *
 * Returns null when no secret is configured, and the caller then leaves
 * the link untracked rather than emitting one that cannot be verified. A
 * link that fails its own check would simply not work for the reader.
 */
export function signTarget(
    recipientToken: string,
    target: string
): string | null {
    const key = secret()
    if (!key) return null

    return crypto
        .createHmac("sha256", key)
        .update(`${recipientToken}:${target}`)
        .digest("hex")
        .slice(0, SIGNATURE_LENGTH)
}

/**
 * Checks a signature in constant time.
 *
 * `timingSafeEqual` throws on a length mismatch, so the length is checked
 * first. That leaks only that a wrong-length signature is wrong.
 */
export function verifyTarget(
    recipientToken: string,
    target: string,
    signature: string
): boolean {
    const expected = signTarget(recipientToken, target)
    if (!expected || !signature) return false

    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false

    return crypto.timingSafeEqual(a, b)
}

/**
 * base64url, because a destination goes in a query string and a plain
 * base64 `+` or `/` would be mangled by some mail clients.
 */
export function encodeTarget(target: string): string {
    return Buffer.from(target, "utf8").toString("base64url")
}

export function decodeTarget(encoded: string): string | null {
    try {
        const value = Buffer.from(encoded, "base64url").toString("utf8")
        return value.length > 0 && value.length <= 2_000 ? value : null
    } catch {
        return null
    }
}

/**
 * A one-way hash of a reader's IP.
 *
 * Stored instead of the address itself. We need to tell two opens apart;
 * we do not need to know where somebody was when they read an email, and
 * keeping that would be a liability under the DPDP Act for no product
 * value.
 *
 * Salted with the tracking secret, so the hashes cannot be matched against
 * a precomputed table of every IPv4 address.
 */
export function hashIp(ip: string | null | undefined): string | undefined {
    const key = secret()
    if (!key || !ip) return undefined

    return crypto
        .createHmac("sha256", key)
        .update(ip)
        .digest("hex")
        .slice(0, 32)
}
