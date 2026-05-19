"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from "lucide-react"

import ActivityLogItem from "./ActivityLogItem"
import type {
    ActivityLogFilterState,
    ActivityLogPagination,
    ActivityLogResponse,
    ActivityLogRow,
} from "./types"

interface Props {
    filters: ActivityLogFilterState
    /** Lock scope to a single user (e.g. profile page). Overrides admin powers. */
    forceUserId?: string
    /** Page size override. */
    limit?: number
}

const DEFAULT_LIMIT = 15
const SEARCH_DEBOUNCE_MS = 300

function buildQuery(
    filters: ActivityLogFilterState,
    page: number,
    limit: number,
    forceUserId?: string
): string {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", String(limit))

    if (forceUserId) {
        params.set("userId", forceUserId)
    } else if (filters.userId) {
        params.set("userId", filters.userId)
    }

    if (filters.entityType) params.set("entityType", filters.entityType)
    if (filters.from) params.set("from", filters.from)
    if (filters.to) {
        // Treat "to" as end-of-day so the date filter feels inclusive.
        const d = new Date(filters.to)
        if (!isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999)
            params.set("to", d.toISOString())
        }
    }
    if (!filters.userId && !forceUserId && filters.q.trim()) {
        params.set("q", filters.q.trim())
    }

    return params.toString()
}

export default function ActivityLogList({
    filters,
    forceUserId,
    limit = DEFAULT_LIMIT,
}: Props) {
    const [page, setPage] = useState(1)
    const [logs, setLogs] = useState<ActivityLogRow[]>([])
    const [pagination, setPagination] =
        useState<ActivityLogPagination | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reqIdRef = useRef(0)

    // Reset to page 1 whenever filters change (debounced for `q`).
    const filtersKey = JSON.stringify(filters)
    useEffect(() => {
        setPage(1)
    }, [filtersKey])

    const fetchLogs = useCallback(async () => {
        const id = ++reqIdRef.current
        setLoading(true)
        setError(null)

        try {
            const qs = buildQuery(filters, page, limit, forceUserId)
            const res = await fetch(
                `/api/admin/operations/activity-logs?${qs}`,
                { credentials: "include", cache: "no-store" }
            )
            const json = (await res.json()) as ActivityLogResponse

            // Drop stale responses
            if (id !== reqIdRef.current) return

            if (!res.ok || !json.success) {
                throw new Error(json.message || "Failed to load activity logs")
            }

            setLogs(json.data)
            setPagination(json.pagination)
        } catch (e) {
            if (id !== reqIdRef.current) return
            setError(
                e instanceof Error ? e.message : "Failed to load activity logs"
            )
            setLogs([])
            setPagination(null)
        } finally {
            if (id === reqIdRef.current) setLoading(false)
        }
    }, [filters, page, limit, forceUserId])

    // Debounce only the search-text path; structural filters fire immediately.
    useEffect(() => {
        const hasFreeText = filters.q && filters.q.trim().length > 0
        if (!hasFreeText) {
            fetchLogs()
            return
        }

        const handle = setTimeout(fetchLogs, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [fetchLogs, filters.q])

    const totalPages = pagination?.pages ?? 0
    const canPrev = page > 1
    const canNext = page < totalPages

    return (
        <div className="space-y-3">
            {/* Header strip */}
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 px-1">
                <span>
                    {pagination
                        ? `${pagination.total} entr${
                              pagination.total === 1 ? "y" : "ies"
                          }`
                        : loading
                          ? "Loading…"
                          : "—"}
                </span>
                {pagination && pagination.pages > 0 && (
                    <span>
                        Page {pagination.page} of {pagination.pages}
                    </span>
                )}
            </div>

            {/* Body */}
            {loading && logs.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading activity…
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 p-4 text-sm">
                    {error}
                </div>
            ) : logs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center">
                    <Inbox className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        No activity matches the current filters.
                    </p>
                </div>
            ) : (
                <div className="space-y-2 relative">
                    {loading && (
                        <div className="absolute inset-x-0 -top-2 flex justify-center pointer-events-none">
                            <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-neutral-900/80 text-white">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Refreshing
                            </span>
                        </div>
                    )}
                    {logs.map((log) => (
                        <ActivityLogItem key={log._id} log={log} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                        type="button"
                        disabled={!canPrev || loading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Prev
                    </button>
                    <span className="text-sm text-neutral-600 dark:text-neutral-400 px-2">
                        {page} / {totalPages}
                    </span>
                    <button
                        type="button"
                        disabled={!canNext || loading}
                        onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                    >
                        Next
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    )
}
