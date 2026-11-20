import { ERROR_CLASS, type ErrorClass } from "@/constants/emailStatus"

/**
 * Reads an SMTP failure and decides what to do about it.
 *
 * ## Why this is its own file with its own tests
 *
 * Getting it wrong is expensive in both directions. Treating a permanent
 * 550 as temporary means five more attempts at an address that will never
 * exist, which is exactly the behaviour that gets a sending domain
 * blocklisted. Treating a temporary 451 as permanent means silently
 * dropping somebody who would have received the mail on the next try.
 *
 * An authentication failure is neither: it means every other message will
 * fail the same way, so the campaign stops and an admin is told.
 */

export interface ClassifiedError {
    errorClass: ErrorClass
    /** The SMTP status code, when the server gave one. */
    smtpCode?: number
    /** One line, safe to show a person. Never a stack. */
    message: string
    /** What the server actually said, kept verbatim for the log. */
    response?: string
}

interface SmtpErrorShape {
    message?: string
    code?: string
    responseCode?: number
    response?: string
}

/**
 * 5xx codes that are permanent even though the first digit is all most
 * code looks at. Listed explicitly because a few 5xx codes are not
 * permanent at all, and the default below has to be safe.
 */
const PERMANENT_CODES = new Set([
    500, 501, 502, 503, 504,
    510, 511, 512, 513,
    521, 523,
    540,
    550, 551, 552, 553, 554, 555,
])

/** 4xx and the handful of 5xx that mean "try later". */
const TRANSIENT_CODES = new Set([
    421, 450, 451, 452, 471,
])

/** The provider is asking us to slow down, not to stop. */
const THROTTLE_CODES = new Set([
    450, 451, 452, 454, 471, 550,
])

/** Node socket errors. None of these came from a mail server. */
const TRANSIENT_NODE_CODES = new Set([
    "ETIMEDOUT", "ESOCKET", "ECONNRESET", "ECONNREFUSED", "EPIPE",
    "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ECONNECTION", "EDNS",
])

/**
 * Phrases that mean throttling whatever the code says.
 *
 * Providers are inconsistent here. Gmail returns 550 for "rate exceeded",
 * which by code alone would look permanent and stop us retrying a message
 * that would go through in a minute. The wording is the only reliable
 * signal, so it is checked before the code.
 */
const THROTTLE_PHRASES = [
    "rate limit", "rate exceeded", "too many", "throttl", "slow down",
    "try again later", "temporarily deferred", "quota exceeded",
    "exceeded the maximum", "message rate", "concurrent connections",
    "4.7.0", "4.7.28",
]

/** Phrases that mean the address is wrong and always will be. */
const PERMANENT_PHRASES = [
    "no such user", "user unknown", "does not exist", "invalid recipient",
    "recipient rejected", "unrouteable address", "no mailbox", "mailbox unavailable",
    "address rejected", "domain not found", "relay denied", "5.1.1", "5.1.10",
]

/** Phrases that mean our credentials are wrong. */
const AUTH_PHRASES = [
    "authentication", "auth failed", "username and password",
    "not accepted", "invalid login", "5.7.0", "5.7.8", "535",
]

export function classifySmtpError(error: unknown): ClassifiedError {
    if (!(error instanceof Error)) {
        return {
            errorClass: ERROR_CLASS.UNKNOWN,
            message: "The send failed for an unknown reason.",
        }
    }

    const err = error as Error & SmtpErrorShape
    const response = err.response?.trim()
    const code = err.responseCode
    const haystack = `${err.message ?? ""} ${response ?? ""}`.toLowerCase()

    const base = {
        smtpCode: code,
        response: response?.slice(0, 2000),
    }

    // Authentication first. It is the only class that stops the campaign,
    // and a wrong password can surface with a 5xx that would otherwise be
    // read as one bad recipient.
    if (err.code === "EAUTH" || AUTH_PHRASES.some((p) => haystack.includes(p))) {
        return {
            ...base,
            errorClass: ERROR_CLASS.AUTH,
            message: response
                ? `The mail server refused the sign-in: ${response}`
                : "The mail server refused the username or password.",
        }
    }

    // Wording before code: see THROTTLE_PHRASES.
    if (THROTTLE_PHRASES.some((p) => haystack.includes(p))) {
        return {
            ...base,
            errorClass: ERROR_CLASS.THROTTLE,
            message: response
                ? `The provider is limiting us: ${response}`
                : "The provider is limiting how fast we can send.",
        }
    }

    if (PERMANENT_PHRASES.some((p) => haystack.includes(p))) {
        return {
            ...base,
            errorClass: ERROR_CLASS.PERMANENT,
            message: response
                ? `The address was rejected: ${response}`
                : "The address was rejected and will not be retried.",
        }
    }

    // A socket problem never reached a mail server, so nothing about the
    // recipient is known. Always worth another try.
    if (err.code && TRANSIENT_NODE_CODES.has(err.code)) {
        return {
            ...base,
            errorClass: ERROR_CLASS.TRANSIENT,
            message: `Could not reach the mail server (${err.code}).`,
        }
    }

    if (code !== undefined) {
        if (THROTTLE_CODES.has(code) && code >= 450 && code < 500) {
            return {
                ...base,
                errorClass: ERROR_CLASS.THROTTLE,
                message: response ?? `The server asked us to slow down (${code}).`,
            }
        }
        if (TRANSIENT_CODES.has(code) || (code >= 400 && code < 500)) {
            return {
                ...base,
                errorClass: ERROR_CLASS.TRANSIENT,
                message: response ?? `A temporary problem (${code}).`,
            }
        }
        if (PERMANENT_CODES.has(code) || (code >= 500 && code < 600)) {
            return {
                ...base,
                errorClass: ERROR_CLASS.PERMANENT,
                message: response ?? `The server rejected it (${code}).`,
            }
        }
    }

    // Unmatched. Treated as temporary but with fewer attempts, because an
    // error we cannot read might be permanent and we should not hammer it.
    return {
        ...base,
        errorClass: ERROR_CLASS.UNKNOWN,
        message: response || err.message || "The send failed.",
    }
}

/**
 * Whether a hard bounce of this class should add the address to the
 * suppression list.
 *
 * Only permanent failures. A timeout is not a reason to stop writing to
 * somebody for ever.
 */
export function shouldSuppressOnFailure(errorClass: ErrorClass): boolean {
    return errorClass === ERROR_CLASS.PERMANENT
}

/** How many attempts a class is worth, given the configured maximum. */
export function attemptsFor(
    errorClass: ErrorClass,
    config: { maxAttemptsTransient: number; maxAttemptsPermanent: number }
): number {
    switch (errorClass) {
        case ERROR_CLASS.PERMANENT:
        case ERROR_CLASS.AUTH:
            return config.maxAttemptsPermanent
        case ERROR_CLASS.UNKNOWN:
            // Fewer than a known transient error: we cannot read it, so we
            // give it less benefit of the doubt.
            return Math.min(3, config.maxAttemptsTransient)
        default:
            return config.maxAttemptsTransient
    }
}
