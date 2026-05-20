"use client"

import { useSearchParams } from "next/navigation"

/**
 * Reads the `?search=` URL param. Pair with the operations SearchBar
 * (which writes the param) on list pages so the URL is the source of
 * truth for the current filter — shareable, reload-safe, history-aware.
 */
export function useSearch(): string {
    const searchParams = useSearchParams()
    return searchParams.get("search") || ""
}
