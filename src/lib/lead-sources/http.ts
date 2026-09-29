import { NextResponse } from "next/server"
import { AuthError } from "@/lib/auth/AuthError"
import { RegionChoiceError } from "@/lib/region-scope/resolveWriteRegion"

/**
 * A refused lead source request, with the status code and the message to
 * show. Throw it from anywhere in a lead source route; `errorResponse` turns
 * it into the usual `{ success: false, message }` body.
 */
export class LeadSourceError extends Error {
    statusCode: number
    field?: string
    details?: unknown

    constructor(message: string, statusCode = 400, extra: { field?: string; details?: unknown } = {}) {
        super(message)
        this.statusCode = statusCode
        this.field = extra.field
        this.details = extra.details
        Object.setPrototypeOf(this, LeadSourceError.prototype)
    }
}

/**
 * The response for anything a lead source route throws.
 *
 * Known errors keep their status and message. Anything else is logged and
 * answered with a 500 and `fallback`, so no internal detail reaches the
 * browser.
 */
export function errorResponse(error: unknown, fallback: string): NextResponse {
    if (error instanceof LeadSourceError) {
        return NextResponse.json(
            {
                success: false,
                message: error.message,
                ...(error.field && { field: error.field }),
                ...(error.details !== undefined && { details: error.details }),
            },
            { status: error.statusCode }
        )
    }

    if (error instanceof RegionChoiceError) {
        return NextResponse.json(
            { success: false, message: error.message, field: error.field },
            { status: error.statusCode }
        )
    }

    if (error instanceof AuthError) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: error.statusCode }
        )
    }

    console.error(`[lead-sources] ${fallback}:`, error)

    return NextResponse.json({ success: false, message: fallback }, { status: 500 })
}

/** Reads a JSON body, or throws a 400 when it is not JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json()
        if (body && typeof body === "object" && !Array.isArray(body)) {
            return body as Record<string, unknown>
        }
    } catch {
        // fall through
    }
    throw new LeadSourceError("The request body must be a JSON object.", 400)
}
