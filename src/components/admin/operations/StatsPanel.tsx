"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

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

const ITEMS: Array<{ key: keyof StatsData; label: string }> = [
    { key: "leads", label: "Leads" },
    { key: "activeClients", label: "Active Clients" },
    { key: "projectsRunning", label: "Projects Running" },
    { key: "meetingsThisWeek", label: "Meetings This Week" },
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
            {ITEMS.map((item) => (
                <div
                    key={item.label}
                    className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-800"
                >
                    <p className="text-xs text-neutral-400">{item.label}</p>
                    <p className="text-lg font-semibold text-blue-400">
                        {stats ? (
                            stats[item.key]
                        ) : loading ? (
                            <span className="inline-block w-8 h-5 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                        ) : (
                            "—"
                        )}
                    </p>
                </div>
            ))}
        </div>
    )
}
