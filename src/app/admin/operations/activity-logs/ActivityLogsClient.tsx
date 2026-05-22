"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, ShieldAlert } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import ActivityLogFilters from "@/components/admin/operations/activityLog/ActivityLogFilters"
import ActivityLogList from "@/components/admin/operations/activityLog/ActivityLogList"
import {
    EMPTY_FILTERS,
    type ActivityLogFilterState,
} from "@/components/admin/operations/activityLog/types"

const ADMIN_ROLES = [10, 20]

export default function ActivityLogsClient() {
    const router = useRouter()
    const { user, loading } = useAuth()
    const [filters, setFilters] = useState<ActivityLogFilterState>({
        ...EMPTY_FILTERS,
    })

    const isAdmin = useMemo(
        () => !!user && ADMIN_ROLES.includes(user.role),
        [user]
    )

    useEffect(() => {
        if (loading) return
        if (!user) {
            router.replace("/admin/authentication/login")
        }
    }, [loading, user, router])

    if (loading) {
        return (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-neutral-600 dark:text-neutral-400">
                Loading…
            </div>
        )
    }

    if (!user) return null

    if (!isAdmin) {
        return (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-6 sm:p-8">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-semibold text-amber-900 dark:text-amber-200">
                            Restricted area
                        </h2>
                        <p className="text-sm text-amber-800 dark:text-amber-200/80 mt-1">
                            The system activity log is available only to
                            administrators. Your own activity is visible on
                            your profile page.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <header>
                <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <Activity className="w-6 h-6 text-emerald-500" />
                    Activity Log
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Every tracked change across the system. Filter by user,
                    entity, or date range.
                </p>
            </header>

            <ActivityLogFilters
                value={filters}
                onChange={setFilters}
                isAdmin
            />

            <ActivityLogList filters={filters} />
        </div>
    )
}