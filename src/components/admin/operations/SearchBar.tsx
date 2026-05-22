"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    usePathname,
    useRouter,
    useSearchParams,
} from "next/navigation"
import { Loader2, Search, X } from "lucide-react"

import SearchResults from "./search/SearchResults"
import type {
    SearchData,
    SearchHit,
    SearchResponse,
} from "./search/types"

const DEBOUNCE_MS = 300
const MIN_DASHBOARD_QUERY = 2

type Mode =
    | { kind: "entity"; entity: "leads" | "clients" | "projects" | "meetings" }
    | { kind: "dashboard" }

const ENTITY_PATHS = ["leads", "clients", "projects", "meetings"] as const

function resolveMode(pathname: string): Mode {
    for (const entity of ENTITY_PATHS) {
        if (pathname === `/admin/operations/${entity}`) {
            return { kind: "entity", entity }
        }
    }
    return { kind: "dashboard" }
}

function placeholderFor(mode: Mode): string {
    if (mode.kind === "entity") {
        return `Search ${mode.entity}…`
    }
    return "Search leads, clients, projects, meetings…"
}

function SearchBarInner() {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()

    const mode = useMemo(() => resolveMode(pathname), [pathname])

    const initial =
        mode.kind === "entity" ? searchParams.get("search") || "" : ""
    const [value, setValue] = useState(initial)

    useEffect(() => {
        if (mode.kind === "entity") {
            setValue(searchParams.get("search") || "")
        } else {
            setValue("")
            setResults(null)
            setOpen(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname])

    useEffect(() => {
        if (mode.kind !== "entity") return

        const handle = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString())
            if (value.trim()) {
                params.set("search", value.trim())
            } else {
                params.delete("search")
            }
            params.delete("page")
            const qs = params.toString()
            router.replace(qs ? `${pathname}?${qs}` : pathname, {
                scroll: false,
            })
        }, DEBOUNCE_MS)

        return () => clearTimeout(handle)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, mode, pathname])

    const [results, setResults] = useState<SearchData | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)
    const reqIdRef = useRef(0)

    useEffect(() => {
        if (mode.kind !== "dashboard") return

        const term = value.trim()

        if (term.length < MIN_DASHBOARD_QUERY) {
            setResults(null)
            setError(null)
            setLoading(false)
            return
        }

        const handle = setTimeout(async () => {
            const id = ++reqIdRef.current
            setLoading(true)
            setError(null)
            try {
                const res = await fetch(
                    `/api/admin/operations/search?search=${encodeURIComponent(term)}`,
                    { credentials: "include", cache: "no-store" }
                )
                const json: SearchResponse = await res.json()
                if (id !== reqIdRef.current) return
                if (!res.ok || !json.success || !json.data) {
                    throw new Error(json.message || "Search failed")
                }
                setResults(json.data)
                setActiveIndex(0)
            } catch (e) {
                if (id !== reqIdRef.current) return
                setError(
                    e instanceof Error ? e.message : "Search failed"
                )
                setResults(null)
            } finally {
                if (id === reqIdRef.current) setLoading(false)
            }
        }, DEBOUNCE_MS)

        return () => clearTimeout(handle)
    }, [value, mode])

    const flatHits: SearchHit[] = useMemo(() => {
        if (!results) return []
        return [
            ...results.leads,
            ...results.clients,
            ...results.projects,
            ...results.meetings,
        ]
    }, [results])

    const wrapperRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (!wrapperRef.current) return
            if (!wrapperRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", onDown)
        return () => document.removeEventListener("mousedown", onDown)
    }, [open])

    const navigateToHit = useCallback(
        (hit: SearchHit) => {
            setOpen(false)
            setValue("")
            setResults(null)
            router.push(hit.href)
        },
        [router]
    )

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (mode.kind !== "dashboard") return

        if (e.key === "Escape") {
            setOpen(false)
            return
        }

        if (!open || flatHits.length === 0) return

        if (e.key === "ArrowDown") {
            e.preventDefault()
            setActiveIndex((i) => (i + 1) % flatHits.length)
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActiveIndex(
                (i) => (i - 1 + flatHits.length) % flatHits.length
            )
        } else if (e.key === "Enter") {
            e.preventDefault()
            const hit = flatHits[activeIndex]
            if (hit) navigateToHit(hit)
        }
    }

    const clear = () => {
        setValue("")
        setResults(null)
        setError(null)
    }

    const showDropdown =
        mode.kind === "dashboard" && open && value.trim().length > 0

    return (
        <div ref={wrapperRef} className="relative w-full">
            {showDropdown && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                    aria-hidden="true"
                />
            )}

            <div className="relative z-50">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />

                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value)
                        if (mode.kind === "dashboard") setOpen(true)
                    }}
                    onFocus={() => {
                        if (mode.kind === "dashboard" && value.trim()) {
                            setOpen(true)
                        }
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={placeholderFor(mode)}
                    className="w-full pl-9 pr-9 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                    ) : value ? (
                        <button
                            type="button"
                            onClick={clear}
                            aria-label="Clear search"
                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    ) : null}
                </div>
            </div>

            {showDropdown && (
                <SearchResults
                    query={value.trim()}
                    data={results}
                    loading={loading}
                    error={error}
                    activeIndex={activeIndex}
                    onHover={setActiveIndex}
                    onSelect={navigateToHit}
                />
            )}
        </div>
    )
}

export default function SearchBar() {
    return (
        <Suspense
            fallback={
                <div className="w-full h-10 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800" />
            }
        >
            <SearchBarInner />
        </Suspense>
    )
}