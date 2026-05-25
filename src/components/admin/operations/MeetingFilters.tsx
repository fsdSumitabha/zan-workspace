"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { MEETING_STATUS_META } from "@/constants/meetingStatus"
import { ENTITY_TYPE_META } from "@/constants/entityTypes"

const FIELD =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"

const TEXT_ACTIVE = "text-neutral-900 dark:text-neutral-100"
const TEXT_PLACEHOLDER = "text-neutral-400 dark:text-neutral-500"

/** Temporal quick-ranges on `scheduledAt`. Empty value = no range filter. */
const RANGES: Array<{ value: string; label: string }> = [
    { value: "", label: "All" },
    { value: "today", label: "Today" },
    { value: "last7", label: "Last 7 days" },
    { value: "upcoming", label: "Upcoming" },
]

/**
 * URL-driven filter for the meetings list — status + a temporal
 * quick-range (Today / Last 7 days / Upcoming) on `scheduledAt`.
 * Writes `status` and `range` to the URL and clears `page` so the
 * list resets to page 1 on every filter change.
 */
export default function MeetingFilters() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const status = searchParams.get("status") || ""
    const range = searchParams.get("range") || ""
    const entityType = searchParams.get("entityType") || ""

    const hasActive = Boolean(status || range || entityType)

    const update = (patch: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString())
        for (const [key, value] of Object.entries(patch)) {
            if (value) params.set(key, value)
            else params.delete(key)
        }
        params.delete("page") // any filter change resets pagination
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const clearAll = () => {
        const params = new URLSearchParams(searchParams.toString())
        for (const key of ["status", "range", "entityType", "page"]) {
            params.delete(key)
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                {/* Status */}
                <div className="flex flex-col gap-1 sm:w-48">
                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                        Status
                    </label>
                    <select
                        className={`${FIELD} ${status ? TEXT_ACTIVE : TEXT_PLACEHOLDER}`}
                        value={status}
                        onChange={(e) => update({ status: e.target.value })}
                    >
                        <option value="">All statuses</option>
                        {Object.entries(MEETING_STATUS_META).map(
                            ([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            )
                        )}
                    </select>
                </div>

                {/* Entity type */}
                <div className="flex flex-col gap-1 sm:w-44">
                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                        Entity
                    </label>
                    <select
                        className={`${FIELD} ${entityType ? TEXT_ACTIVE : TEXT_PLACEHOLDER}`}
                        value={entityType}
                        onChange={(e) =>
                            update({ entityType: e.target.value })
                        }
                    >
                        <option value="">All entities</option>
                        {Object.entries(ENTITY_TYPE_META).map(
                            ([value, meta]) => (
                                <option key={value} value={value}>
                                    {meta.label}
                                </option>
                            )
                        )}
                    </select>
                </div>

                {/* Temporal quick-range */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                        When
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {RANGES.map((r) => {
                            const active = range === r.value
                            return (
                                <button
                                    key={r.value || "all"}
                                    type="button"
                                    onClick={() => update({ range: r.value })}
                                    className={`px-3 py-2 text-sm rounded-lg border transition ${
                                        active
                                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                                            : "border-slate-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                    }`}
                                >
                                    {r.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {hasActive && (
                    <div className="sm:ml-auto">
                        <button
                            type="button"
                            onClick={clearAll}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <X className="w-4 h-4" />
                            Clear filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
