"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

interface Options {
    /** URL search param name. Defaults to `page`. */
    paramName?: string
    /**
     * Page number considered "default" — when setPage is called with this
     * value the param is removed from the URL, keeping canonical URLs
     * clean (`/leads` instead of `/leads?page=1`).
     */
    defaultPage?: number
}

interface Result {
    page: number
    setPage: (next: number) => void
}

/**
 * URL-synced pagination state. The current page lives in the URL search
 * params so:
 *   - reloads land on the same page
 *   - links are shareable (`?page=3`)
 *   - browser back/forward steps through pagination history
 *
 * Used by every list page (leads / clients / projects / meetings / users)
 * so behavior stays consistent.
 */
export function usePagination(options: Options = {}): Result {
    const { paramName = "page", defaultPage = 1 } = options

    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const raw = Number.parseInt(searchParams.get(paramName) || "", 10)
    const page = Number.isFinite(raw) && raw >= 1 ? raw : defaultPage

    const setPage = useCallback(
        (next: number) => {
            const params = new URLSearchParams(searchParams.toString())
            if (next === defaultPage) {
                params.delete(paramName)
            } else {
                params.set(paramName, String(next))
            }
            const qs = params.toString()
            router.push(qs ? `${pathname}?${qs}` : pathname, {
                scroll: false,
            })
        },
        [router, pathname, searchParams, paramName, defaultPage]
    )

    return { page, setPage }
}
