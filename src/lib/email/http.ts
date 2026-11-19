import { NextResponse } from "next/server"
import { AuthError } from "@/lib/auth/AuthError"
import { RegionChoiceError } from "@/lib/region-scope/resolveWriteRegion"

/**
 * A refused email marketing request, with the status code and the message
 * to show. Throw it from anywhere in an email route; `errorResponse` turns
 * it into the usual `{ success: false, message }` body.
 *
 * Same shape as LeadSourceError in src/lib/lead-sources/http.ts, so the
 * forms behave identically.
 */
export class EmailError extends Error {
    statusCode: number
    field?: string
    details?: unknown

    constructor(
        message: string,
        statusCode = 400,
        extra: { field?: string; details?: unknown } = {}
    ) {
        super(message)
        this.statusCode = statusCode
        this.field = extra.field
        this.details = extra.details
        Object.setPrototypeOf(this, EmailError.prototype)
    }
}

/**
 * The response for anything an email route throws.
 *
 * Known errors keep their status and message. Anything else is logged and
 * answered with a 500 and `fallback`, so no internal detail, and no part of
 * an SMTP password, reaches the browser.
 */
export function errorResponse(error: unknown, fallback: string): NextResponse {
    if (error instanceof EmailError) {
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

    console.error(`[email] ${fallback}:`, error)

    return NextResponse.json({ success: false, message: fallback }, { status: 500 })
}

/** Reads a JSON body, or throws a 400 when it is not a JSON object. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json()
        if (body && typeof body === "object" && !Array.isArray(body)) {
            return body as Record<string, unknown>
        }
    } catch {
        // fall through
    }
    throw new EmailError("The request body must be a JSON object.", 400)
}

/** A trimmed string from a request body, or undefined when it is empty. */
export function readString(
    body: Record<string, unknown>,
    key: string,
    maxLength = 1000
): string | undefined {
    const raw = body[key]
    if (typeof raw !== "string") return undefined
    const value = raw.trim()
    return value ? value.slice(0, maxLength) : undefined
}

/** A required trimmed string, or a 400 naming the field. */
export function requireString(
    body: Record<string, unknown>,
    key: string,
    label: string,
    maxLength = 1000
): string {
    const value = readString(body, key, maxLength)
    if (!value) {
        throw new EmailError(`${label} is required.`, 400, { field: key })
    }
    return value
}

/** A whole number inside a range, or undefined when it is not a number. */
export function readNumber(
    body: Record<string, unknown>,
    key: string,
    min: number,
    max: number
): number | undefined {
    const raw = body[key]
    if (raw === undefined || raw === null || raw === "") return undefined

    const n = Number(raw)
    if (!Number.isFinite(n)) {
        throw new EmailError(`${key} must be a number.`, 400, { field: key })
    }
    if (n < min || n > max) {
        throw new EmailError(`${key} must be between ${min} and ${max}.`, 400, {
            field: key,
        })
    }
    return n
}

const OBJECT_ID = /^[a-f0-9]{24}$/i

/** True when a value looks like a Mongo ObjectId. */
export function isObjectId(value: unknown): value is string {
    return typeof value === "string" && OBJECT_ID.test(value)
}
