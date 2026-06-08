"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import NotificationBadge from "@/components/admin/operations/NotificationBadge"

interface Row {
    _id: string
    type: number
    title: string
    body?: string
    url?: string
    badge?: string
    imageUrl?: string
    seenAt: string | null
    readAt: string | null
    createdAt: string
}

interface FeedResponse {
    success: boolean
    data?: Row[]
    unseen?: number
    unread?: number
    total?: number
    nextCursor?: string | null
}

const PAGE_SIZE = 15

export default function NotificationsPage() {
    const router = useRouter()
    const [rows, setRows] = useState<Row[]>([])
    const [unread, setUnread] = useState(0)
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<"all" | "unread">("all")

    const [cursors, setCursors] = useState<(string | null)[]>([null])
    const [pageIdx, setPageIdx] = useState(0)
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const seenFiredRef = useRef(false)

    const load = useCallback(async (cursor: string | null) => {
        const cursorParam = cursor ? `&before=${cursor}` : ""
        const unreadParam = filter === "unread" ? "&unread=true" : ""
        const url = `/api/notifications?limit=${PAGE_SIZE}${cursorParam}${unreadParam}`
        try {
            setLoading(true)
            const res = await fetch(url, { credentials: "include", cache: "no-store" })
            const json: FeedResponse = await res.json()
            if (!json.success) return
            setRows(json.data ?? [])
            setUnread(json.unread ?? 0)
            setTotal(json.total ?? 0)
            setNextCursor(json.nextCursor ?? null)
        } catch {
            /* silent */
        } finally {
            setLoading(false)
        }
    }, [filter])

    useEffect(() => {
        setCursors([null])
        setPageIdx(0)
        load(null)
    }, [filter, load])

    useEffect(() => {
        if (seenFiredRef.current) return
        seenFiredRef.current = true
        fetch("/api/notifications/seen", { method: "PATCH", credentials: "include" }).catch(() => {})
    }, [])

    const goNext = () => {
        if (!nextCursor) return
        const newCursors = [...cursors.slice(0, pageIdx + 1), nextCursor]
        setCursors(newCursors)
        setPageIdx(pageIdx + 1)
        load(nextCursor)
    }

    const goPrev = () => {
        if (pageIdx === 0) return
        const prevIdx = pageIdx - 1
        setPageIdx(prevIdx)
        load(cursors[prevIdx])
    }

    const markOneRead = (id: string, url?: string) => {
        setRows((prev) => prev.map((r) => r._id === id ? { ...r, readAt: new Date().toISOString() } : r))
        setUnread((u) => Math.max(0, u - 1))
        fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" }).catch(() => {})
        if (url) router.push(url)
    }

    const markAllRead = async () => {
        const now = new Date().toISOString()
        setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? now })))
        setUnread(0)
        try {
            await fetch("/api/notifications/read-all", { method: "PATCH", credentials: "include" })
            toast.success("All notifications marked as read")
        } catch {
            toast.error("Failed to mark all read")
        }
    }

    const rangeStart = pageIdx * PAGE_SIZE + 1
    const rangeEnd = pageIdx * PAGE_SIZE + rows.length
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div className="space-y-3 sm:space-y-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                    <Bell className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
                    <h1 className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-white">
                        Notifications
                    </h1>
                    {unread > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-700 dark:text-red-400">
                            {unread} unread
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setFilter("all")}
                            className={`px-3 py-1.5 text-xs ${filter === "all"
                                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                : "text-neutral-600 dark:text-neutral-400"}`}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter("unread")}
                            className={`px-3 py-1.5 text-xs border-l border-neutral-200 dark:border-neutral-800 ${filter === "unread"
                                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                : "text-neutral-600 dark:text-neutral-400"}`}
                        >
                            Unread
                        </button>
                    </div>
                    {unread > 0 && (
                        <button
                            type="button"
                            onClick={markAllRead}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Mark all read</span>
                            <span className="sm:hidden">All read</span>
                        </button>
                    )}
                </div>
            </header>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Notifications older than 30 days are automatically removed.
            </p>

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-neutral-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-8 sm:p-10 text-center text-sm text-neutral-500">
                    {filter === "unread" ? "No unread notifications" : "No notifications yet"}
                </div>
            ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                    {rows.map((row) => {
                        const isUnread = !row.readAt
                        const isFresh = isUnread && !row.seenAt
                        const Wrapper = ({ children }: { children: React.ReactNode }) =>
                            row.url
                                ? <Link href={row.url} onClick={(e) => { e.preventDefault(); markOneRead(row._id, row.url) }}>{children}</Link>
                                : <div onClick={() => isUnread && markOneRead(row._id)}>{children}</div>

                        return (
                            <li key={row._id}>
                                <Wrapper>
                                    <div className={`relative px-3 sm:px-4 py-3 flex gap-2.5 sm:gap-3 border-l-2 cursor-pointer transition ${
                                        isFresh
                                            ? "border-blue-500 bg-blue-50/60 dark:bg-blue-500/[0.07] hover:bg-blue-50 dark:hover:bg-blue-500/10"
                                            : isUnread
                                                ? "border-amber-400 bg-amber-50/40 dark:bg-amber-500/[0.05] hover:bg-amber-50/70 dark:hover:bg-amber-500/10"
                                                : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                                    }`}>
                                        <NotificationBadge badge={row.badge} size="md" />

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start gap-2">
                                                <div className={`flex-1 min-w-0 text-sm ${isUnread ? "font-semibold text-neutral-900 dark:text-white" : "font-normal text-neutral-600 dark:text-neutral-400"}`}>
                                                    <span className="break-words">{row.title}</span>
                                                    {isFresh && (
                                                        <span className="ml-2 inline-flex items-center align-middle text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500 text-white">
                                                            New
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {row.body && (
                                                <div className={`text-xs mt-0.5 line-clamp-2 ${isUnread ? "text-neutral-700 dark:text-neutral-300" : "text-neutral-500 dark:text-neutral-500"}`}>
                                                    {row.body}
                                                </div>
                                            )}
                                            <div className="text-[11px] text-neutral-500 mt-1">
                                                <TimeAgo date={row.createdAt} />
                                            </div>
                                        </div>

                                        {isUnread && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOneRead(row._id) }}
                                                className="shrink-0 self-start -m-1 p-1.5 rounded-md text-neutral-400 hover:text-blue-600 hover:bg-blue-500/10 dark:hover:text-blue-400"
                                                aria-label="Mark as read"
                                                title="Mark as read"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </Wrapper>
                            </li>
                        )
                    })}
                </ul>
            )}

            {total > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {loading ? "Loading…" : (
                            <>
                                Showing <span className="font-semibold text-neutral-700 dark:text-neutral-200">{rangeStart}–{rangeEnd}</span> of <span className="font-semibold text-neutral-700 dark:text-neutral-200">{total}</span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={goPrev}
                            disabled={pageIdx === 0 || loading}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Newer</span>
                        </button>
                        <span className="px-2 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                            {pageIdx + 1} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={!nextCursor || loading}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <span className="hidden sm:inline">Older</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
