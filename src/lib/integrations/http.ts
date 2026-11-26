import { NextResponse } from "next/server"

/**
 * Errors and answers for the website integration routes.
 *
 * Every answer is JSON in the shape the rest of the API uses:
 *   { "success": true, "status": "received" }
 *   { "success": false, "message": "...", "details": [...] }
 */

export interface FieldProblem {
    field: string
    message: string
}

export class IntegrationError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly details?: FieldProblem[],
        readonly headers?: Record<string, string>
    ) {
        super(message)
        this.name = "IntegrationError"
    }
}

const NO_STORE = { "Cache-Control": "no-store" }

export function succeed(status: string): NextResponse {
    return NextResponse.json({ success: true, status }, { status: 200, headers: NO_STORE })
}

export function errorResponse(error: unknown, label: string): NextResponse {
    if (error instanceof IntegrationError) {
        return NextResponse.json(
            {
                success: false,
                message: error.message,
                ...(error.details ? { details: error.details } : {}),
            },
            { status: error.status, headers: { ...NO_STORE, ...error.headers } }
        )
    }

    // Never the body: it holds someone's contact details.
    console.error(`[integrations] ${label} failed:`, error instanceof Error ? error.message : error)
    return NextResponse.json(
        { success: false, message: "Internal error" },
        { status: 500, headers: NO_STORE }
    )
}

/**
 * Refuses a call made from a web page.
 *
 * These routes are for a website's server, which holds the key. A browser
 * always sends Origin on a cross-origin POST, and Sec-Fetch-Site on every
 * fetch. Node's fetch sends neither (it does send Sec-Fetch-Mode, so that
 * one is not checked). So a key copied into a page still cannot be used
 * from it. There are no CORS headers either, so a browser's preflight
 * fails before a POST is sent.
 */
export function refuseBrowserCall(req: Request): void {
    if (req.headers.get("origin") || req.headers.get("sec-fetch-site")) {
        throw new IntegrationError(
            "This route takes calls from a website's server only, not from a browser.",
            403
        )
    }
}

/** Larger than any real lead or sign-up. A message is at most 5,000 characters. */
const MAX_BODY_BYTES = 64 * 1024

export async function readJsonBody(req: Request): Promise<unknown> {
    const type = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
    if (type !== "application/json") {
        throw new IntegrationError("Send the body as application/json.", 415)
    }

    const declared = Number(req.headers.get("content-length") ?? 0)
    if (declared > MAX_BODY_BYTES) {
        throw new IntegrationError("The body is too large.", 413)
    }

    const text = await req.text()
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
        throw new IntegrationError("The body is too large.", 413)
    }

    try {
        return JSON.parse(text)
    } catch {
        throw new IntegrationError("The body is not valid JSON.", 400)
    }
}

/** E11000: a unique index refused the write. */
export function isDuplicateKeyError(error: unknown): error is { code: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> } {
    return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000
}
