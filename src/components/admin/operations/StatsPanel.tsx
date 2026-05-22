"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import {
    Target,
    Handshake,
    FolderKanban,
    CalendarClock,
    type LucideIcon,
} from "lucide-react"

interface StatsData {
    leads: number
    activeClients: number
    projectsRunning: number
    meetingsThisWeek: number
}

interface ApiResponse {
    success: boolean
    data?: StatsData
    message?: string
}

const ITEMS: Array<{
    key: keyof StatsData
    label: string
    icon: LucideIcon
    accent: string
}> = [
    {
        key: "leads",
        label: "Leads",
        icon: Target,
        accent: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
        key: "activeClients",
        label: "Active Clients",
        icon: Handshake,
        accent: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
        key: "projectsRunning",
        label: "Projects Running",
        icon: FolderKanban,
        accent: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
    {
        key: "meetingsThisWeek",
        label: "Meetings This Week",
        icon: CalendarClock,
        accent: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
]

export default function StatsPanel() {
    const [stats, setStats] = useState<StatsData | null>(null)
    const [loading, setLoading] = useState(true)
    const pathname = usePathname()

    // Refetch on every navigation within /admin/operations so the panel
    // catches up after the user creates/deletes/edits an entity on a
    // child page and comes back. The layout (and this panel) doesn't
    // remount between routes, so without this we'd be frozen on mount.
    useEffect(() => {
        let cancelled = false

        fetch("/api/admin/operations/stats", {
            credentials: "include",
            cache: "no-store",
        })
            .then((r) => r.json() as Promise<ApiResponse>)
            .then((json) => {
                if (cancelled) return
                if (json.success && json.data) setStats(json.data)
            })
            .catch(() => {
                // Silent — the panel falls back to "—" placeholders.
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [pathname])

    return (
        <div className="space-y-3">
            {ITEMS.map((item) => {
                const Icon = item.icon
                return (
                    <div
                        key={item.label}
                        className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow flex items-center gap-3"
                    >
                        <div
                            className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${item.accent}`}
                        >
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                {item.label}
                            </p>
                            <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                                {stats ? (
                                    stats[item.key]
                                ) : loading ? (
                                    <span className="inline-block w-8 h-5 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                                ) : (
                                    "—"
                                )}
                            </p>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
