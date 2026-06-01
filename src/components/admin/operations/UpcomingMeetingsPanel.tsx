"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    CalendarClock,
    ChevronRight,
    BarChart3,
    Video,
    Users as UsersIcon,
} from "lucide-react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import calendar from "dayjs/plugin/calendar"

import { ENTITY_TYPE } from "@/constants/entityTypes"
import { MEETING_TYPE } from "@/constants/meetingTypes"

dayjs.extend(relativeTime)
dayjs.extend(calendar)

interface MeetingItem {
    _id: string
    title: string
    agenda?: string
    scheduledAt: string
    meetingType?: number
    entityType?: number
    entityId?: string
    entity?: {
        type: number
        label: string
        title: string
    }
}

interface ApiResponse {
    success: boolean
    data?: MeetingItem[]
    message?: string
}

const VISIBLE_COUNT = 4

function parentHref(type: number | undefined, id: string | undefined): string | null {
    if (!id) return null
    switch (type) {
        case ENTITY_TYPE.LEAD:
            return `/admin/operations/leads/${id}`
        case ENTITY_TYPE.CLIENT:
            return `/admin/operations/clients/${id}`
        case ENTITY_TYPE.PROJECT:
            return `/admin/operations/projects/${id}`
        default:
            return null
    }
}

function smartDate(iso: string): string {
    const d = dayjs(iso)
    const now = dayjs()
    const diffDays = d.startOf("day").diff(now.startOf("day"), "day")

    if (diffDays === 0) return `Today, ${d.format("h:mm A")}`
    if (diffDays === 1) return `Tomorrow, ${d.format("h:mm A")}`
    if (diffDays > 1 && diffDays < 7) return d.format("ddd, h:mm A")
    return d.format("MMM D, h:mm A")
}

export default function UpcomingMeetingsPanel() {
    const [meetings, setMeetings] = useState<MeetingItem[]>([])
    const [loading, setLoading] = useState(true)
    const pathname = usePathname()

    useEffect(() => {
        let cancelled = false

        // The meetings API hardcodes `sort: scheduledAt: -1` (newest-first),
        // so for "upcoming" we receive farthest-future first. Pull a wider
        // window than we need and re-sort client-side soonest-first.
        fetch("/api/admin/operations/meetings?range=upcoming&limit=20", {
            credentials: "include",
            cache: "no-store",
        })
            .then((r) => r.json() as Promise<ApiResponse>)
            .then((json) => {
                if (cancelled) return
                if (json.success && Array.isArray(json.data)) {
                    const sorted = [...json.data].sort(
                        (a, b) =>
                            new Date(a.scheduledAt).getTime() -
                            new Date(b.scheduledAt).getTime()
                    )
                    setMeetings(sorted.slice(0, VISIBLE_COUNT))
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [pathname])

    return (
        <section
            aria-label="Upcoming meetings"
            className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden"
        >
            <header className="px-3 py-2.5 border-b border-slate-200 dark:border-neutral-800 flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex-1">
                    Upcoming meetings
                </h3>
                <Link
                    href="/admin/operations/meetings?range=upcoming"
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                    All
                </Link>
            </header>

            {loading && (
                <ul className="divide-y divide-slate-200 dark:divide-neutral-800">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <li key={i} className="px-3 py-2.5">
                            <div className="h-3 w-2/3 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
                            <div className="h-2.5 w-1/3 mt-1.5 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
                        </li>
                    ))}
                </ul>
            )}

            {!loading && meetings.length === 0 && (
                <div className="px-3 py-5 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    No upcoming meetings
                </div>
            )}

            {!loading && meetings.length > 0 && (
                <ul className="divide-y divide-slate-200 dark:divide-neutral-800">
                    {meetings.map((m) => {
                        const href = parentHref(m.entityType, m.entityId)
                        const isOnline = m.meetingType === MEETING_TYPE.ONLINE
                        const Inner = (
                            <div className="px-3 py-2.5 flex items-start gap-2.5">
                                <div className="mt-0.5 shrink-0 w-7 h-7 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                    {isOnline ? (
                                        <Video className="w-3.5 h-3.5" />
                                    ) : (
                                        <UsersIcon className="w-3.5 h-3.5" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[12px] font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                        {m.title || m.agenda || "Untitled meeting"}
                                    </div>
                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1 mt-0.5">
                                        <span>{smartDate(m.scheduledAt)}</span>
                                        {m.entity?.title && (
                                            <>
                                                <span>·</span>
                                                <span className="truncate">
                                                    {m.entity.title}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {href && (
                                    <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0 text-neutral-400" />
                                )}
                            </div>
                        )

                        return href ? (
                            <li key={m._id}>
                                <Link
                                    href={href}
                                    className="block hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition"
                                >
                                    {Inner}
                                </Link>
                            </li>
                        ) : (
                            <li key={m._id}>{Inner}</li>
                        )
                    })}
                </ul>
            )}

            {/* Link to the detailed analytics page */}
            <Link
                href="/admin/operations/overall-stats"
                className="px-3 py-2 border-t border-slate-200 dark:border-neutral-800 flex items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition"
            >
                <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                <span className="flex-1 font-medium">View pipeline overview</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </Link>
        </section>
    )
}
