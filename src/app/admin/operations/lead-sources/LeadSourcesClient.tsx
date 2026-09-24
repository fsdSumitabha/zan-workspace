"use client"

import Link from "next/link"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import clsx from "clsx"
import { toast } from "sonner"
import { AlarmClock, FileUp, PhoneCall } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { canManageLeadSources } from "@/constants/leadSourceRoles"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { todayString } from "@/lib/lead-sources/day"
import { usePagination } from "@/hooks/usePagination"
import { useSearch } from "@/hooks/useSearch"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import Pagination from "@/components/admin/operations/Pagination"
import type {
    LeadSourceCounts,
    LeadSourceListResponse,
    LeadSourceRow as Row,
    LeadSourceView,
} from "@/types/leadSource"
import { LEAD_SOURCES_API, LEAD_SOURCES_PAGE } from "@/components/admin/operations/lead-sources/api"
import { AssignDialog, DayDialog, DeleteDialog, StatusDialog } from "@/components/admin/operations/lead-sources/ActionDialogs"
import BulkBar, { type BulkDialog } from "@/components/admin/operations/lead-sources/BulkBar"
import LeadSourceFilters, { StatusFilter, type FilterValues } from "@/components/admin/operations/lead-sources/LeadSourceFilters"
import LeadSourceRow, { LeadSourceRowSkeleton } from "@/components/admin/operations/lead-sources/LeadSourceRow"
import ViewTabs from "@/components/admin/operations/lead-sources/ViewTabs"
import { useNow } from "@/components/admin/operations/lead-sources/useNow"

const PAGE_SIZE = 50
const VIEWS = new Set<LeadSourceView>(["today", "upcoming", "unscheduled", "closed", "all"])

/** How often the list quietly reloads, so a callback that falls due moves to the top. */
const REFRESH_MS = 60_000

const SECTION_TITLE: Record<number, { text: string; tone: string }> = {
    0: { text: "Callbacks due now", tone: "text-rose-700 dark:text-rose-300" },
    1: { text: "Today", tone: "text-neutral-500 dark:text-neutral-400" },
    2: { text: "Left over from earlier days", tone: "text-amber-700 dark:text-amber-300" },
}

export default function LeadSourcesClient() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { role } = useAuth()
    const isManager = canManageLeadSources(role)
    const { page, setPage } = usePagination()
    const search = useSearch()
    const now = useNow(15_000)
    const today = todayString()

    const rawView = (searchParams.get("view") || "today") as LeadSourceView
    const filters: FilterValues = {
        status: searchParams.get("status") || "",
        assignee: searchParams.get("assignee") || "",
        day: searchParams.get("day") || "",
        upload: searchParams.get("upload") || "",
    }
    const view: LeadSourceView = filters.day ? "day" : VIEWS.has(rawView) ? rawView : "today"

    const [rows, setRows] = useState<Row[]>([])
    const [counts, setCounts] = useState<LeadSourceCounts | null>(null)
    const [progress, setProgress] = useState<{ total: number; worked: number } | null>(null)
    const [pages, setPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [dialog, setDialog] = useState<BulkDialog | null>(null)

    const query = useMemo(() => {
        const params = new URLSearchParams({
            view: view === "day" ? "all" : view,
            today,
            page: String(page),
            limit: String(PAGE_SIZE),
        })
        if (search) params.set("search", search)
        for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
        return params.toString()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, today, page, search, filters.status, filters.assignee, filters.day, filters.upload])

    const requestId = useRef(0)

    const load = useCallback(
        async (quiet = false) => {
            const id = ++requestId.current
            if (!quiet) setLoading(true)
            try {
                const res = await fetch(`${LEAD_SOURCES_API}?${query}`, { cache: "no-store" })
                const json: LeadSourceListResponse | null = await res.json().catch(() => null)
                if (id !== requestId.current) return

                if (handleAuthError(res, json, router, (msg) => {
                    setAccessError(msg)
                    setRows([])
                })) return

                if (json?.success) {
                    setAccessError(null)
                    setRows(json.data)
                    setCounts(json.counts)
                    setProgress(json.progress)
                    setPages(json.pagination.pages)
                    setTotal(json.pagination.total)
                } else if (!quiet) {
                    toast.error(json?.message || "Failed to load lead sources")
                }
            } catch {
                if (!quiet) toast.error("Failed to load lead sources")
            } finally {
                // Whichever request is newest ends the loading state, quiet or
                // not. A quiet reload that starts during a normal one takes over
                // from it, and the normal one's answer is thrown away.
                if (id === requestId.current) setLoading(false)
            }
        },
        [query, router]
    )

    // Timers call the newest `load` through this, never a copy from an older
    // render that still holds the previous view's query.
    const loadRef = useRef(load)
    loadRef.current = load

    useEffect(() => {
        load()
    }, [load])

    // A new view, filter or page is a new list. A selection from the old
    // one would point at rows that are no longer on screen.
    useEffect(() => {
        setSelected(new Set())
    }, [query])

    // Quiet reload every minute and when the tab comes back, so due callbacks
    // move to the top and the counts stay true. Not while the person is in
    // the middle of something: a menu, a dialog, or a selection.
    const menusOpen = useRef(0)
    const busy = useRef(false)
    busy.current = selected.size > 0 || dialog !== null

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState !== "visible") return
            if (busy.current || menusOpen.current > 0) return
            load(true)
        }
        const timer = setInterval(refresh, REFRESH_MS)
        document.addEventListener("visibilitychange", refresh)
        return () => {
            clearInterval(timer)
            document.removeEventListener("visibilitychange", refresh)
        }
    }, [load])

    const onMenuOpenChange = useCallback((open: boolean) => {
        menusOpen.current = Math.max(0, menusOpen.current + (open ? 1 : -1))
    }, [])

    // Swap the changed row in at once, then reload quietly so it moves to
    // where it now belongs and the counts follow.
    const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onUpdated = useCallback((row: Row) => {
        setRows((list) => list.map((r) => (r._id === row._id ? { ...r, ...row, section: r.section } : r)))
        if (reloadTimer.current) clearTimeout(reloadTimer.current)
        reloadTimer.current = setTimeout(() => loadRef.current(true), 900)
    }, [])

    // A new view, filter or page loads on its own. A reload still waiting
    // from the old list is not needed, and neither is one after leaving.
    useEffect(
        () => () => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current)
        },
        [query]
    )

    const setParams = (patch: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString())
        for (const [key, value] of Object.entries(patch)) {
            if (value) params.set(key, value)
            else params.delete(key)
        }
        params.delete("page")
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const toggle = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r._id))
    const someOnPage = rows.some((r) => selected.has(r._id))
    const selectedIds = [...selected]
    const selectedRegions = [...new Set(rows.filter((r) => selected.has(r._id)).map((r) => r.region))]

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && selected.size > 0 && !dialog) setSelected(new Set())
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [selected.size, dialog])

    const afterBulk = () => {
        setSelected(new Set())
        loadRef.current(true)
    }

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    const dueCount = counts?.callbacksDue ?? 0
    const progressShare = progress && progress.total > 0 ? Math.round((progress.worked / progress.total) * 100) : 0

    return (
        // w-0 + min-w-full: the page fills its column but never widens it.
        // The layout puts pages in a grid track, and one-line text such as a
        // long company name would otherwise stretch that track past the
        // screen on a phone.
        <div className="w-0 min-w-full space-y-3 pb-28">
            {/* Title */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                        <PhoneCall className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold leading-tight text-neutral-900 dark:text-neutral-100">Lead Sources</h1>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {isManager ? "Cold-calling lists for the whole team" : "Numbers to call, assigned to you"}
                        </p>
                    </div>
                </div>

                {isManager && (
                    <Link
                        href={`${LEAD_SOURCES_PAGE}/upload`}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
                    >
                        <FileUp className="h-4 w-4" />
                        Upload sheet
                    </Link>
                )}
            </div>

            {/* Callbacks due */}
            {dueCount > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                    <span className="flex items-center gap-2 font-medium">
                        <AlarmClock className="ls-ring h-4 w-4" />
                        {dueCount === 1 ? "1 callback is due." : `${dueCount} callbacks are due.`}
                    </span>
                    {(view !== "today" || page !== 1) && (
                        <button
                            type="button"
                            onClick={() => setParams({ view: "", day: "" })}
                            className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-rose-100 dark:hover:bg-rose-500/20"
                        >
                            Show them
                        </button>
                    )}
                </div>
            )}

            <ViewTabs
                view={view}
                counts={counts}
                onChange={(next) => setParams({ view: next === "today" ? "" : next, day: "" })}
                trailing={<StatusFilter value={filters.status} onChange={(status) => setParams({ status })} />}
            />

            {isManager && (
                <LeadSourceFilters
                    values={filters}
                    onChange={(patch) => setParams(patch as Record<string, string>)}
                    onClear={() => setParams({ status: "", assignee: "", day: "", upload: "" })}
                />
            )}

            {/* Today's progress */}
            {view === "today" && progress && progress.total > 0 && (
                <div className="flex items-center gap-3 px-1">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressShare}%` }} />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
                        {progress.worked} of {progress.total} for today called
                    </span>
                </div>
            )}

            {/* The list */}
            <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center gap-2.5 border-b border-slate-200 py-2 pl-3 pr-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <input
                        type="checkbox"
                        checked={allOnPage}
                        ref={(el) => {
                            if (el) el.indeterminate = !allOnPage && someOnPage
                        }}
                        disabled={rows.length === 0}
                        onChange={() =>
                            setSelected((prev) => {
                                const next = new Set(prev)
                                if (allOnPage) rows.forEach((r) => next.delete(r._id))
                                else rows.forEach((r) => next.add(r._id))
                                return next
                            })
                        }
                        aria-label="Select every row on this page"
                        className="h-4 w-4 cursor-pointer rounded accent-blue-600"
                    />
                    <span className="tabular-nums">
                        {loading ? "Loading..." : `${total} ${total === 1 ? "source" : "sources"}`}
                        {!loading && pages > 1 && ` · page ${page} of ${pages}`}
                    </span>
                    {selected.size > 0 && (
                        <span className="ml-auto text-blue-600 dark:text-blue-400">
                            Tap rows to add or remove them. Esc clears.
                        </span>
                    )}
                </div>

                {loading && (
                    <div className="divide-y divide-slate-100 dark:divide-neutral-800">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <LeadSourceRowSkeleton key={i} />
                        ))}
                    </div>
                )}

                {!loading && rows.length === 0 && (
                    <EmptyState view={view} isManager={isManager} filtered={Boolean(search || Object.values(filters).some(Boolean))} />
                )}

                {!loading && rows.length > 0 && (
                    <div className="divide-y divide-slate-100 dark:divide-neutral-800">
                        {rows.map((row, i) => {
                            const showSection =
                                view === "today" && row.section !== undefined && row.section !== rows[i - 1]?.section
                            const section = row.section !== undefined ? SECTION_TITLE[row.section] : undefined
                            return (
                                <Fragment key={row._id}>
                                    {showSection && section && (
                                        <div
                                            className={clsx(
                                                "bg-slate-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide dark:bg-neutral-800/40",
                                                section.tone
                                            )}
                                        >
                                            {section.text}
                                        </div>
                                    )}
                                    <LeadSourceRow
                                        row={row}
                                        view={view}
                                        today={today}
                                        now={now}
                                        selected={selected.has(row._id)}
                                        selecting={selected.size > 0}
                                        showAssignee={isManager}
                                        onToggle={toggle}
                                        onUpdated={onUpdated}
                                        onMenuOpenChange={onMenuOpenChange}
                                    />
                                </Fragment>
                            )
                        })}
                    </div>
                )}
            </div>

            {!loading && pages > 1 && <Pagination page={page} totalPages={pages} disabled={loading} onChange={setPage} />}

            <BulkBar count={selected.size} isManager={isManager} onOpen={setDialog} onClear={() => setSelected(new Set())} />

            {dialog === "status" && (
                <StatusDialog open onClose={() => setDialog(null)} ids={selectedIds} onDone={afterBulk} />
            )}
            {dialog === "assign" && (
                <AssignDialog open onClose={() => setDialog(null)} ids={selectedIds} regions={selectedRegions} onDone={afterBulk} />
            )}
            {dialog === "day" && <DayDialog open onClose={() => setDialog(null)} ids={selectedIds} onDone={afterBulk} />}
            {dialog === "delete" && (
                <DeleteDialog open onClose={() => setDialog(null)} ids={selectedIds} onDone={afterBulk} />
            )}
        </div>
    )
}

function EmptyState({ view, isManager, filtered }: { view: LeadSourceView; isManager: boolean; filtered: boolean }) {
    let title = "Nothing here"
    let body = ""

    if (filtered) {
        title = "No lead sources match"
        body = "Change the search or the filters."
    } else if (view === "today") {
        title = "Nothing to call today"
        body = isManager
            ? "Upload a sheet, or give sources in the No day tab a day and a person."
            : "Sources show up here when a manager gives them to you for today."
    } else if (view === "upcoming") {
        body = "No open sources are set for a later day."
    } else if (view === "unscheduled") {
        body = "Every open source has a day."
    } else if (view === "closed") {
        body = "Sources marked Not Interested, Wrong Number or Converted show up here."
    }

    return (
        <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{title}</p>
            {body && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{body}</p>}
        </div>
    )
}
