"use client"

import { useCallback, useRef } from "react"
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
 * `setPage` is referentially stable across renders — it pulls the latest
 * searchParams / pathname through a ref. This matters when callers put
 * `setPage` in a `useEffect` dependency array (otherwise re-firing the
 * effect after each push would cause an infinite loop).
 */
export function usePagination(options: Options = {}): Result {
    const { paramName = "page", defaultPage = 1 } = options

    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const raw = Number.parseInt(searchParams.get(paramName) || "", 10)
    const page = Number.isFinite(raw) && raw >= 1 ? raw : defaultPage

    // Keep latest values reachable from a stable setPage closure.
    const latest = useRef({ searchParams, pathname, paramName, defaultPage })
    latest.current = { searchParams, pathname, paramName, defaultPage }

    const setPage = useCallback(
        (next: number) => {
            const {
                searchParams: sp,
                pathname: pn,
                paramName: name,
                defaultPage: def,
            } = latest.current

            const params = new URLSearchParams(sp.toString())
            if (next === def) {
                params.delete(name)
            } else {
                params.set(name, String(next))
            }
            const qs = params.toString()
            router.push(qs ? `${pn}?${qs}` : pn, { scroll: false })
        },
        [router]
    )

    return { page, setPage }
}
