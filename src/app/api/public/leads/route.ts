import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { auditedCreate } from "@/lib/activity-log"
import { verifyClientPortalKey } from "@/lib/security/timingSafeKey"
import { resolveAllowedOrigin, withCors } from "@/lib/security/withCors"
import { checkRateLimit } from "@/lib/security/rateLimit"

const RATE_LIMIT = 5 // submissions per IP per window.
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour.

const NAME_MAX = 120
const PHONE_MAX = 20
const EMAIL_MAX = 200

// Permissive phone shape: starts with `+` or digit, then digits with
// optional spaces/dashes/parens, total length 6+. Real-world numbers
// vary widely; stricter validation belongs in a follow-up using a
// library like libphonenumber-js if needed.
const PHONE_REGEX = /^[+\d][\d\s\-()]{5,}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getClientIp(req: NextRequest): string {
    const xff = req.headers.get("x-forwarded-for")
    if (xff) {
        const first = xff.split(",")[0]?.trim()
        if (first) return first
    }
    return req.headers.get("x-real-ip") || "unknown"
}

function respond(
    body: unknown,
    status: number,
    origin: string | null
): NextResponse {
    return withCors(NextResponse.json(body, { status }), origin)
}

/**
 * Preflight. We mirror the matched origin (or none) — the browser
 * blocks the follow-up POST when no Allow-Origin comes back, which is
 * exactly what we want for disallowed origins.
 */
export function OPTIONS(req: NextRequest) {
    const origin = resolveAllowedOrigin(req.headers.get("origin"))
    return withCors(new NextResponse(null, { status: 204 }), origin)
}

/**
 * Public, session-less lead intake — called from the static client
 * portal site (different origin). The endpoint is intentionally
 * permissive about who calls it (no user auth), so security is
 * defense-in-depth:
 *
 *   1. Origin allowlist     — 403 if not on `CLIENT_PORTAL_ORIGIN`
 *   2. API key (timing-safe)— 401 on bad/missing `x-api-key`
 *   3. Rate limit per IP    — 429 with `Retry-After`
 *   4. Honeypot field       — silent 201 if filled
 *
 * Created leads carry `source: "client-portal"` and an unset
 * `createdBy` (the Lead schema types `createdBy` as ObjectId(ref User);
 * a string sentinel would throw a cast error, so we leave it null and
 * rely on `source` to identify portal-originated rows).
 */
export async function POST(req: NextRequest) {
    const requestOrigin = req.headers.get("origin")
    const matchedOrigin = resolveAllowedOrigin(requestOrigin)

    // 1. Origin allowlist. Reject before doing any other work so we
    //    don't burn rate-limit budget on requests that can't proceed.
    if (!matchedOrigin) {
        // Disallowed origin → no Allow-Origin echo (don't confirm the
        // attacker's origin string back to them).
        return respond({ success: false, message: "Forbidden" }, 403, null)
    }

    // 2. API key. Constant-time compare so we don't leak the prefix via
    //    response-time differences.
    if (!verifyClientPortalKey(req.headers.get("x-api-key"))) {
        return respond(
            { success: false, message: "Unauthorized" },
            401,
            matchedOrigin
        )
    }

    // 3. Rate limit. Per IP, in-memory. The xff parsing trusts the
    //    deployment's edge — if the app is exposed directly, swap for
    //    the raw socket address.
    const ip = getClientIp(req)
    const rl = checkRateLimit(
        `public-lead:${ip}`,
        RATE_LIMIT,
        RATE_WINDOW_MS
    )
    if (!rl.allowed) {
        const res = respond(
            { success: false, message: "Too many requests" },
            429,
            matchedOrigin
        )
        res.headers.set("Retry-After", String(rl.retryAfterSec))
        return res
    }

    let raw: Record<string, unknown>
    try {
        const parsed = await req.json()
        if (!parsed || typeof parsed !== "object") {
            return respond(
                { success: false, message: "Invalid request" },
                400,
                matchedOrigin
            )
        }
        raw = parsed as Record<string, unknown>
    } catch {
        return respond(
            { success: false, message: "Invalid request" },
            400,
            matchedOrigin
        )
    }

    // 4. Honeypot. Bots fill every input they see; humans don't see this
    //    one (the form hides it with CSS / `tabindex=-1`). We return
    //    success rather than 400 so the bot doesn't learn that the field
    //    is a tell — if it errored, the bot would adapt and submit blank.
    if (
        typeof raw.company_website === "string" &&
        raw.company_website.trim()
    ) {
        return respond({ success: true }, 201, matchedOrigin)
    }

    // Mass-assignment guard: only the fields below are pulled from the
    // body. Anything else the client sends (status, assignedTo,
    // createdBy, convertedClientId, source) is silently dropped — they
    // are server-controlled.
    const name =
        typeof raw.name === "string" ? raw.name.trim() : ""
    const phone =
        typeof raw.phone === "string" ? raw.phone.trim() : ""
    const email =
        typeof raw.email === "string" ? raw.email.trim() : ""

    // Generic 400 on any validation failure — don't tell the client
    // *which* field is bad (mild enumeration hardening + simpler UI).
    if (!name || name.length > NAME_MAX) {
        return respond(
            { success: false, message: "Invalid request" },
            400,
            matchedOrigin
        )
    }
    if (!phone || phone.length > PHONE_MAX || !PHONE_REGEX.test(phone)) {
        return respond(
            { success: false, message: "Invalid request" },
            400,
            matchedOrigin
        )
    }
    if (email && (email.length > EMAIL_MAX || !EMAIL_REGEX.test(email))) {
        return respond(
            { success: false, message: "Invalid request" },
            400,
            matchedOrigin
        )
    }

    try {
        await dbConnect()

        // Duplicate handling: a public form must not leak whether a
        // phone is already on file (enumeration). On hit we return the
        // *same* generic success as a real create. The catch below
        // covers the race (two concurrent submits clearing the
        // findOne, second one hitting E11000 on the unique index).
        const existing = await Lead.findOne({ phone })
            .select("_id")
            .lean()
        if (existing) {
            return respond({ success: true }, 201, matchedOrigin)
        }

        // `source` is forced server-side. `status` falls back to the
        // schema default (LEAD_STATUS.NEW). `createdBy` stays unset.
        const lead = await auditedCreate(
            Lead,
            "LEAD",
            {
                name,
                phone,
                ...(email ? { email } : {}),
                source: "client-portal",
            },
            null // no authenticated actor; audit row records user=null.
        )

        // Minimal confirmation only — do NOT echo the full lead doc to
        // a public caller (could leak server-side defaults / refs).
        return respond(
            { success: true, data: { id: String(lead._id) } },
            201,
            matchedOrigin
        )
    } catch (err: unknown) {
        // E11000 dedupe race: another insert sneaked in between the
        // findOne and save. Treat as the duplicate path — same generic
        // success, no leak.
        if (
            typeof err === "object" &&
            err !== null &&
            (err as { code?: number }).code === 11000
        ) {
            return respond({ success: true }, 201, matchedOrigin)
        }

        console.error("Public lead intake error:", err)
        return respond(
            { success: false, message: "Internal error" },
            500,
            matchedOrigin
        )
    }
}
