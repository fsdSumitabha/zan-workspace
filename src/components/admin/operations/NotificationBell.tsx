"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, Check, CheckCheck } from "lucide-react"
import TimeAgo from "./dayjs/TimeAgo"

interface NotificationRow {
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
    data?: NotificationRow[]
    unseen?: number
    unread?: number
}

const POLL_INTERVAL_MS = 30_000

export default function NotificationBell() {
    const [open, setOpen] = useState(false)
    const [rows, setRows] = useState<NotificationRow[]>([])
    const [unseen, setUnseen] = useState(0)
    const [unread, setUnread] = useState(0)
    const [loading, setLoading] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)

    const load = async () => {
        try {
            setLoading(true)
            const res = await fetch("/api/notifications?limit=20", {
                credentials: "include",
                cache: "no-store",
            })
            const json: FeedResponse = await res.json()
            if (json.success) {
                setRows(json.data ?? [])
                setUnseen(json.unseen ?? 0)
                setUnread(json.unread ?? 0)
            }
        } catch {
            /* silent */
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
        const t = setInterval(load, POLL_INTERVAL_MS)
        return () => clearInterval(t)
    }, [])

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", onDown)
            document.removeEventListener("keydown", onKey)
        }
    }, [open])

    const handleOpen = async () => {
        const next = !open
        setOpen(next)
        if (next && unseen > 0) {
            setUnseen(0)
            fetch("/api/notifications/seen", { method: "PATCH", credentials: "include" }).catch(() => {})
        }
    }

    const markOneRead = async (id: string) => {
        setRows((prev) => prev.map((r) => r._id === id ? { ...r, readAt: new Date().toISOString() } : r))
        setUnread((u) => Math.max(0, u - 1))
        fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" }).catch(() => {})
    }

    const markAllRead = async () => {
        const now = new Date().toISOString()
        setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? now })))
        setUnread(0)
        fetch("/api/notifications/read-all", { method: "PATCH", credentials: "include" }).catch(() => {})
    }

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={handleOpen}
                className="relative h-9 w-9 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                aria-label="Notifications"
            >
                <Bell className="w-4 h-4" />
                {unseen > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unseen > 99 ? "99+" : unseen}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg overflow-hidden z-50">
                    <div className="px-3 py-2 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
                        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Notifications
                        </span>
                        {unread > 0 && (
                            <button type="button" onClick={markAllRead} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                                <CheckCheck className="w-3 h-3" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-[55vh] overflow-y-auto">
                        {loading && rows.length === 0 && (
                            <div className="px-3 py-6 text-center text-xs text-neutral-500">Loading…</div>
                        )}
                        {!loading && rows.length === 0 && (
                            <div className="px-3 py-6 text-center text-xs text-neutral-500">No notifications yet</div>
                        )}
                        {!loading && rows.length > 0 && rows.map((row) => {
                            const isUnread = !row.readAt
                            const Wrapper = ({ children }: { children: React.ReactNode }) =>
                                row.url
                                    ? <Link href={row.url} onClick={() => { if (isUnread) markOneRead(row._id); setOpen(false) }}>{children}</Link>
                                    : <div onClick={() => isUnread && markOneRead(row._id)}>{children}</div>

                            return (
                                <Wrapper key={row._id}>
                                    <div className={`px-3 py-2.5 flex gap-2 cursor-pointer border-l-2 transition ${
                                        isUnread
                                            ? "border-blue-500 bg-blue-50/60 dark:bg-blue-500/5 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                                            : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-900"
                                    }`}>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-xs truncate ${isUnread ? "font-semibold text-neutral-900 dark:text-white" : "font-medium text-neutral-700 dark:text-neutral-300"}`}>
                                                {row.title}
                                            </div>
                                            {row.body && (
                                                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
                                                    {row.body}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-neutral-500 dark:text-neutral-500 mt-1">
                                                <TimeAgo date={row.createdAt} />
                                            </div>
                                        </div>
                                        {isUnread && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOneRead(row._id) }}
                                                className="shrink-0 self-start text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
                                                aria-label="Mark as read"
                                                title="Mark as read"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </Wrapper>
                            )
                        })}
                    </div>

                    <Link
                        href="/admin/operations/notifications"
                        onClick={() => setOpen(false)}
                        className="block px-3 py-2 text-center text-xs font-medium text-blue-600 dark:text-blue-400 border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    >
                        View all notifications
                    </Link>
                </div>
            )}
        </div>
    )
}
