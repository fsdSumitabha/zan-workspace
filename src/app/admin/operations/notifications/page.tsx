"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"

interface Row {
    _id: string
    type: number
    title: string
    body?: string
    url?: string
    seenAt: string | null
    readAt: string | null
    createdAt: string
}

interface FeedResponse {
    success: boolean
    data?: Row[]
    unseen?: number
    unread?: number
    nextCursor?: string | null
}

export default function NotificationsPage() {
    const router = useRouter()
    const [rows, setRows] = useState<Row[]>([])
    const [unread, setUnread] = useState(0)
    const [cursor, setCursor] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [done, setDone] = useState(false)
    const [filter, setFilter] = useState<"all" | "unread">("all")

    const load = useCallback(async (mode: "fresh" | "more") => {
        const cursorParam = mode === "more" && cursor ? `&before=${cursor}` : ""
        const unreadParam = filter === "unread" ? "&unread=true" : ""
        const url = `/api/notifications?limit=20${cursorParam}${unreadParam}`
        try {
            if (mode === "fresh") setLoading(true); else setLoadingMore(true)
            const res = await fetch(url, { credentials: "include", cache: "no-store" })
            const json: FeedResponse = await res.json()
            if (!json.success) return
            if (mode === "fresh") {
                setRows(json.data ?? [])
            } else {
                setRows((prev) => [...prev, ...(json.data ?? [])])
            }
            setUnread(json.unread ?? 0)
            setCursor(json.nextCursor ?? null)
            setDone(!json.nextCursor)
        } catch {
            /* silent */
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [cursor, filter])

    useEffect(() => {
        setCursor(null)
        setDone(false)
        load("fresh")
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])

    const markOneRead = async (id: string, url?: string) => {
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

    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
                    <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">Notifications</h1>
                    {unread > 0 && (
                        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-700 dark:text-red-400">
                            {unread} unread
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                        <button type="button" onClick={() => setFilter("all")} className={`px-3 py-1.5 text-xs ${filter === "all" ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400"}`}>All</button>
                        <button type="button" onClick={() => setFilter("unread")} className={`px-3 py-1.5 text-xs border-l border-neutral-200 dark:border-neutral-800 ${filter === "unread" ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400"}`}>Unread</button>
                    </div>
                    {unread > 0 && (
                        <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10">
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark all read
                        </button>
                    )}
                </div>
            </header>

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Notifications older than 30 days are automatically removed.
            </p>

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-neutral-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500">
                    {filter === "unread" ? "No unread notifications" : "No notifications yet"}
                </div>
            ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                    {rows.map((row) => {
                        const isUnread = !row.readAt
                        const Wrapper = ({ children }: { children: React.ReactNode }) =>
                            row.url
                                ? <Link href={row.url} onClick={(e) => { e.preventDefault(); markOneRead(row._id, row.url) }}>{children}</Link>
                                : <div onClick={() => isUnread && markOneRead(row._id)}>{children}</div>

                        return (
                            <li key={row._id}>
                                <Wrapper>
                                    <div className={`px-4 py-3 flex gap-3 border-l-2 cursor-pointer transition ${
                                        isUnread
                                            ? "border-blue-500 bg-blue-50/40 dark:bg-blue-500/5 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                                            : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                                    }`}>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm ${isUnread ? "font-semibold text-neutral-900 dark:text-white" : "font-medium text-neutral-700 dark:text-neutral-300"}`}>
                                                {row.title}
                                            </div>
                                            {row.body && (
                                                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 truncate">
                                                    {row.body}
                                                </div>
                                            )}
                                            <div className="text-[11px] text-neutral-500 mt-1">
                                                <TimeAgo date={row.createdAt} />
                                            </div>
                                        </div>
                                        {isUnread && (
                                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOneRead(row._id) }} className="shrink-0 self-start text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400" aria-label="Mark as read" title="Mark as read">
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

            {!done && rows.length > 0 && (
                <div className="flex justify-center">
                    <button type="button" onClick={() => load("more")} disabled={loadingMore} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50">
                        {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {loadingMore ? "Loading…" : "Load more"}
                    </button>
                </div>
            )}
        </div>
    )
}
