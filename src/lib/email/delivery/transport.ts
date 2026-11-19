import nodemailer, { type Transporter } from "nodemailer"
import { configFingerprint } from "@/lib/email/config/crypto"
import type { ProviderWithSecret } from "@/lib/email/config/providerConfig"

/**
 * One pooled SMTP transporter, reused for as long as the process lives.
 *
 * ## Why module scope
 *
 * Vercel's Fluid Compute lets several invocations share one instance and
 * one process. A transporter held here is therefore reused across
 * concurrent invocations on a warm instance, and the TLS handshake happens
 * once instead of once per email.
 *
 * It is NOT shared across instances, and a cold start gets a fresh one.
 * That is exactly why the real send rate is enforced by the distributed
 * limiter in rateLimiter.ts, and why `rateLimit` below is only a local
 * backstop. Ten workers each capped at 2 per second send 20 per second,
 * which the provider sees as 20.
 *
 * ## Why maxConnections should stay at 1
 *
 * The pool is per process, so connections multiply by however many
 * instances are warm. Most providers cap concurrent connections per
 * account, and going over gets the account throttled rather than failing
 * cleanly.
 */

interface Cached {
    key: string
    transporter: Transporter
}

let cached: Cached | null = null

/**
 * A transporter supplied by a test, used instead of a real connection.
 *
 * The seam exists because the worker builds its own transporter from the
 * stored provider settings, which is right for production and impossible
 * to test against without a mail server. A simulation sets this to a
 * transport that records instead of sending.
 *
 * It is ignored unless NODE_ENV is not "production", so a stray call in
 * deployed code cannot silently stop real mail going out.
 */
let injected: Transporter | null = null

export function setTestTransport(transporter: Transporter | null): void {
    if (process.env.NODE_ENV === "production") {
        throw new Error("setTestTransport must never be called in production.")
    }
    injected = transporter
}

/**
 * The transporter for a provider, built once and reused.
 *
 * Changing any connection setting changes the fingerprint, so the old pool
 * is closed and a new one is built. A password change takes effect on the
 * next send without a deploy.
 */
export function getTransport(provider: ProviderWithSecret): Transporter {
    if (injected && process.env.NODE_ENV !== "production") return injected

    const key = configFingerprint({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        user: provider.user,
        passCipher: provider.passCipher,
        maxConnections: provider.maxConnections,
        maxMessages: provider.maxMessages,
    })

    if (cached?.key === key) return cached.transporter

    // Settings changed, or this is the first call in this process. Close
    // the old pool so its sockets are not left open.
    if (cached) {
        try {
            cached.transporter.close()
        } catch {
            // A pool that is already shut is not a problem.
        }
    }

    const transporter = nodemailer.createTransport({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        auth: { user: provider.user, pass: provider.pass },

        pool: true,
        maxConnections: provider.maxConnections,
        maxMessages: provider.maxMessages,

        // A local backstop only. The real limit is global and lives in
        // rateLimiter.ts. This stops one runaway process, not the system.
        rateDelta: 1000,
        rateLimit: Math.max(1, provider.globalPerSecond),

        // Fail fast rather than holding a worker's lease while a dead
        // connection times out.
        connectionTimeout: 20_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
    })

    cached = { key, transporter }
    return transporter
}

/**
 * Opens a connection and authenticates, without sending anything.
 *
 * This is what the "test connection" button calls. It returns the server's
 * own words on failure, because "535 Username and Password not accepted"
 * tells a person far more than "could not connect".
 *
 * It builds a throwaway transporter rather than touching the cached pool,
 * so testing an unsaved password cannot disturb a campaign that is sending.
 */
export async function testConnection(provider: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
}): Promise<{ ok: boolean; message: string }> {
    const probe = nodemailer.createTransport({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        auth: { user: provider.user, pass: provider.pass },
        // No `pool` key at all. Pooling is off by default, and passing
        // `pool: false` explicitly picks a different Nodemailer overload
        // that does not accept `host`.
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
    })

    try {
        await probe.verify()
        return { ok: true, message: "Connected and signed in." }
    } catch (error) {
        return { ok: false, message: describeSmtpError(error) }
    } finally {
        try {
            probe.close()
        } catch {
            // Nothing to do.
        }
    }
}

/**
 * Turns a Nodemailer error into one line a person can act on.
 *
 * It keeps the server's own response when there is one. Guessing is worse
 * than quoting.
 */
export function describeSmtpError(error: unknown): string {
    if (!(error instanceof Error)) return "The connection failed."

    const withCode = error as Error & { code?: string; response?: string }
    const response = withCode.response?.trim()

    switch (withCode.code) {
        case "EAUTH":
            return response
                ? `The server refused the sign-in: ${response}`
                : "The server refused the username or password."
        case "ECONNECTION":
        case "ECONNREFUSED":
            return "Could not reach the server. Check the host and the port."
        case "ETIMEDOUT":
        case "ESOCKET":
            return "The connection timed out. Check the host, the port and whether TLS is right for that port."
        case "EDNS":
            return "That host name could not be found."
        default:
            return response || error.message || "The connection failed."
    }
}

/**
 * Closes the pooled transporter. For tests and scripts, so a process can
 * exit instead of hanging on an open socket.
 */
export function closeTransport(): void {
    if (!cached) return
    try {
        cached.transporter.close()
    } catch {
        // Already closed.
    }
    cached = null
}
