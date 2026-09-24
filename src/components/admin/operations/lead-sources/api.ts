"use client"

import { toast } from "sonner"

/** A refused request, with the message and field the API sent. */
export class ApiError extends Error {
    status: number
    field?: string
    details?: unknown

    constructor(message: string, status: number, field?: string, details?: unknown) {
        super(message)
        this.status = status
        this.field = field
        this.details = details
    }
}

const LOGIN_PATH = "/admin/authentication/login"

/**
 * Sends a request to a lead source route and returns `data`.
 *
 * Throws ApiError with the server's message for anything but success, so the
 * caller can show it as it is. A 401 also sends the person to the login page,
 * the same as handleAuthError does for the list pages.
 */
export async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData

    const res = await fetch(url, {
        method,
        headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    })

    const json = await res.json().catch(() => null)

    if (res.status === 401) {
        toast.error(json?.message || "Session expired. Please log in again.", { id: "auth-401" })
        window.location.href = LOGIN_PATH
    }

    if (!res.ok || !json?.success) {
        throw new ApiError(
            json?.message || "Something went wrong. Try again.",
            res.status,
            json?.field,
            json?.details
        )
    }

    return json.data as T
}

export const LEAD_SOURCES_API = "/api/admin/operations/lead-sources"
export const LEAD_SOURCES_PAGE = "/admin/operations/lead-sources"
