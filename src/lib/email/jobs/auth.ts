import { timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"
import { EmailError } from "@/lib/email/http"

/**
 * Constant-time string comparison.
 *
 * Written here rather than reusing src/lib/security/timingSafeKey.ts,
 * because that one compares against CLIENT_PORTAL_API_KEY specifically and
 * is depended on by the public lead endpoint. Widening it would change a
 * security-sensitive file for an unrelated feature.
 *
 * `timingSafeEqual` throws when the lengths differ, so the length is
 * checked first. That leaks only that a wrong-length secret is wrong, not
 * which bytes are wrong.
 */
function secretsMatch(given: string, expected: string): boolean {
    if (!given || !expected) return false

    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false

    return timingSafeEqual(a, b)
}

/**
 * Guards the job endpoints.
 *
 * `/api/jobs/email/*` runs the dispatcher and the worker. They are not
 * reachable from a browser session and they take no user input; the only
 * caller is the scheduler, or the app waking its own worker.
 *
 * The secret is compared with a timing-safe helper the app already has, so
 * a wrong guess leaks nothing about how wrong it was.
 */

const HEADER = "x-job-secret"

export function jobSecret(): string | null {
    const secret = process.env.EMAIL_JOB_SECRET?.trim()
    return secret && secret.length >= 16 ? secret : null
}

/**
 * Throws unless the request carries the right secret.
 *
 * A missing EMAIL_JOB_SECRET refuses every request rather than allowing
 * them. An unguarded endpoint that can send email to a hundred people is
 * worse than one that does not run.
 */
export function requireJobSecret(req: NextRequest): void {
    const expected = jobSecret()

    if (!expected) {
        throw new EmailError(
            "EMAIL_JOB_SECRET is not set, so the job endpoints are switched " +
            "off. Add it to the environment and redeploy.",
            503
        )
    }

    // Our own header, used by the app waking its own worker and by any
    // external pinger.
    if (secretsMatch(req.headers.get(HEADER) ?? "", expected)) return

    /**
     * Vercel's own scheduler cannot set a custom header. It sends
     * `Authorization: Bearer <CRON_SECRET>` instead, so a deployment that
     * uses Vercel Cron or Schedules is accepted through this path.
     *
     * It is only honoured when CRON_SECRET is actually set. Without it,
     * Vercel sends no authorization at all and an unguarded endpoint that
     * can email a hundred people would be open to anyone.
     */
    const cronSecret = process.env.CRON_SECRET?.trim()
    if (cronSecret && cronSecret.length >= 16) {
        const bearer = (req.headers.get("authorization") ?? "").replace(
            /^Bearer\s+/i,
            ""
        )
        if (secretsMatch(bearer, cronSecret)) return
    }

    throw new EmailError("Not authorised.", 401)
}

/**
 * The absolute URL of a job endpoint.
 *
 * It has to be absolute: the app calls its own worker over HTTP, and a
 * relative URL has nothing to resolve against inside a server runtime.
 *
 * EMAIL_PUBLIC_ORIGIN is preferred because it is the one value somebody
 * sets deliberately. The Vercel-provided URL is a fallback so a preview
 * deployment works without configuration, and localhost is the last
 * resort for development.
 */
export function jobEndpoint(name: "dispatch" | "work"): string | null {
    const origin =
        process.env.EMAIL_PUBLIC_ORIGIN?.trim() ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : "") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
        (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "")

    if (!origin) return null

    return `${origin.replace(/\/+$/, "")}/api/jobs/email/${name}`
}

/** A name for one worker invocation, written to the rows it claims. */
export function workerId(): string {
    const host =
        process.env.VERCEL_REGION ??
        process.env.AWS_REGION ??
        "local"

    return `${host}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
}
