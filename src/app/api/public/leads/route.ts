import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { auditedCreate } from "@/lib/activity-log"
import { verifyClientPortalKey } from "@/lib/security/timingSafeKey"
import { resolveAllowedOrigin, withCors } from "@/lib/security/withCors"
import { checkRateLimit } from "@/lib/security/rateLimit"

const RATE_LIMIT = 5 
const RATE_WINDOW_MS = 60 * 60 * 1000 

const NAME_MAX = 120
const PHONE_MAX = 20
const EMAIL_MAX = 200

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

export async function POST(req: NextRequest) {
    const requestOrigin = req.headers.get("origin")
    const matchedOrigin = resolveAllowedOrigin(requestOrigin)

    if (!matchedOrigin) {
        return respond({ success: false, message: "Forbidden" }, 403, null)
    }

    if (!verifyClientPortalKey(req.headers.get("x-api-key"))) {
        return respond(
            { success: false, message: "Unauthorized" },
            401,
            matchedOrigin
        )
    }

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

    if (
        typeof raw.company_website === "string" &&
        raw.company_website.trim()
    ) {
        return respond({ success: true }, 201, matchedOrigin)
    }
  
    const name =
        typeof raw.name === "string" ? raw.name.trim() : ""
    const phone =
        typeof raw.phone === "string" ? raw.phone.trim() : ""
    const email =
        typeof raw.email === "string" ? raw.email.trim() : ""

    
    
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

        
        
        
        
        
        const existing = await Lead.findOne({ phone })
            .select("_id")
            .lean()
        if (existing) {
            return respond({ success: true }, 201, matchedOrigin)
        }

        // Attribute portal-originated leads to the Zanservices system
        // user (seeded once via `npm run seed:zanservices`). The id is
        // stored in env to avoid a DB lookup on every request.
        const zanservicesId = process.env.ZANSERVICES_USER_ID
        if (!zanservicesId) {
            console.error(
                "ZANSERVICES_USER_ID env var missing — run `npm run seed:zanservices` and add the printed id to .env.local"
            )
            return respond(
                { success: false, message: "Server misconfigured" },
                500,
                matchedOrigin
            )
        }

        const lead = await auditedCreate(
            Lead,
            "LEAD",
            {
                name,
                phone,
                ...(email ? { email } : {}),
                source: "client-portal",
                createdBy: zanservicesId,
            },
            zanservicesId
        )

        
        
        return respond(
            { success: true, data: { id: String(lead._id) } },
            201,
            matchedOrigin
        )
    } catch (err: unknown) {
        
        
        
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
