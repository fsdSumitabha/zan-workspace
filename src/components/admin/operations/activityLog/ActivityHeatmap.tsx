"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

interface HeatmapData {
    year: number
    total: number
    days: { date: string; count: number }[]
    scope: "all" | "self"
}

interface ApiResponse {
    success: boolean
    data?: HeatmapData
    message?: string
}

interface Props {
    /** Locks the heatmap to a single user (profile page). */
    forceUserId?: string
    /** Admin filter selection — heatmap reflects it when set. */
    selectedUserId?: string
}

const CELL = "w-[11px] h-[11px] rounded-sm"
const CELL_GAP = "gap-[3px]"

/** Days of the week in row order. Sunday-start to match GitHub. */
const DOW_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const

function formatUTCDate(d: Date): string {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function colorForCount(count: number): string {
    if (count < 0) return "bg-transparent"
    if (count === 0) return "bg-neutral-200 dark:bg-neutral-800"
    if (count <= 2) return "bg-emerald-500/30"
    if (count <= 5) return "bg-emerald-500/55"
    if (count <= 10) return "bg-emerald-500/80"
    return "bg-emerald-500"
}

interface Cell {
    date: Date
    dateStr: string
    count: number // -1 if outside the selected year
}

export default function ActivityHeatmap({
    forceUserId,
    selectedUserId,
}: Props) {
    const currentYear = new Date().getUTCFullYear()
    const [year, setYear] = useState(currentYear)
    const [data, setData] = useState<HeatmapData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const userIdToQuery = forceUserId || selectedUserId || ""

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({ year: String(year) })
        if (userIdToQuery) params.set("userId", userIdToQuery)

        fetch(
            `/api/admin/operations/activity-logs/heatmap?${params.toString()}`,
            { credentials: "include", cache: "no-store" }
        )
            .then((r) => r.json())
            .then((json: ApiResponse) => {
                if (cancelled) return
                if (json.success && json.data) {
                    setData(json.data)
                } else {
                    setError(json.message || "Failed to load heatmap")
                }
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load heatmap")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [year, userIdToQuery])

    const weeks = useMemo<Cell[][]>(() => {
        const counts = new Map<string, number>()
        if (data) {
            for (const d of data.days) counts.set(d.date, d.count)
        }

        const yearStart = new Date(Date.UTC(year, 0, 1))
        const firstDow = yearStart.getUTCDay() // 0 = Sunday
        const gridStart = new Date(
            Date.UTC(year, 0, 1 - firstDow)
        )

        const yearEnd = new Date(Date.UTC(year, 11, 31))
        const grid: Cell[][] = []
        let week: Cell[] = []
        const cursor = new Date(gridStart)

        // Walk one day at a time, packing into 7-day weeks. Stop after the
        // week that contains Dec 31.
        while (true) {
            const dateStr = formatUTCDate(cursor)
            const inYear = cursor.getUTCFullYear() === year
            week.push({
                date: new Date(cursor),
                dateStr,
                count: inYear ? counts.get(dateStr) ?? 0 : -1,
            })

            const isWeekEnd = week.length === 7
            const reachedYearEnd = cursor.getTime() >= yearEnd.getTime()

            cursor.setUTCDate(cursor.getUTCDate() + 1)

            if (isWeekEnd) {
                grid.push(week)
                week = []
                if (reachedYearEnd) break
            }
        }

        return grid
    }, [data, year])

    // Per-column month label: the first column where the in-year date is
    // in the first week of a new month relative to the previous column.
    const monthLabels = useMemo(() => {
        const labels: (string | null)[] = []
        let lastMonth = -1

        for (const week of weeks) {
            const firstInYear = week.find((c) => c.count >= 0)
            if (!firstInYear) {
                labels.push(null)
                continue
            }
            const month = firstInYear.date.getUTCMonth()
            if (month !== lastMonth && firstInYear.date.getUTCDate() <= 7) {
                labels.push(
                    firstInYear.date.toLocaleString("en", {
                        month: "short",
                        timeZone: "UTC",
                    })
                )
                lastMonth = month
            } else {
                labels.push(null)
            }
        }

        return labels
    }, [weeks])

    const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

    const total = data?.total ?? 0
    const heading = loading
        ? "Loading activity…"
        : error
          ? "Activity heatmap"
          : `${total} contribution${total === 1 ? "" : "s"} in ${year}`

    return (
        <div className="rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                {/* Main column */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2 flex items-center gap-2">
                        {heading}
                        {loading && (
                            <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
                        )}
                    </h3>

                    {error ? (
                        <p className="text-sm text-red-600 dark:text-red-300">
                            {error}
                        </p>
                    ) : (
                        <div className="overflow-x-auto -mx-1 px-1">
                            <div className="inline-block">
                                {/* Month-label row, indented past the DOW column */}
                                <div
                                    className={`flex ${CELL_GAP} ml-8 mb-1 text-[10px] text-neutral-500 dark:text-neutral-400`}
                                >
                                    {monthLabels.map((label, i) => (
                                        <div key={i} className="w-[11px]">
                                            {label ?? ""}
                                        </div>
                                    ))}
                                </div>

                                <div className={`flex ${CELL_GAP}`}>
                                    {/* DOW labels (Mon/Wed/Fri) */}
                                    <div
                                        className={`flex flex-col ${CELL_GAP} text-[10px] text-neutral-500 dark:text-neutral-400 mr-1 w-7`}
                                    >
                                        {DOW_LABELS.map((d, i) => (
                                            <div
                                                key={i}
                                                className="h-[11px] leading-[11px]"
                                            >
                                                {d}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Week columns */}
                                    {weeks.map((week, wi) => (
                                        <div
                                            key={wi}
                                            className={`flex flex-col ${CELL_GAP}`}
                                        >
                                            {week.map((cell, di) => (
                                                <div
                                                    key={di}
                                                    className={`${CELL} ${colorForCount(cell.count)} ${
                                                        cell.count > 0
                                                            ? "ring-1 ring-emerald-500/0 hover:ring-emerald-500/40 transition-shadow"
                                                            : ""
                                                    }`}
                                                    title={
                                                        cell.count >= 0
                                                            ? `${cell.count} ${cell.count === 1 ? "activity" : "activities"} on ${cell.dateStr}`
                                                            : ""
                                                    }
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Legend */}
                    <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                        <span>Less</span>
                        <div className={`${CELL} bg-neutral-200 dark:bg-neutral-800`} />
                        <div className={`${CELL} bg-emerald-500/30`} />
                        <div className={`${CELL} bg-emerald-500/55`} />
                        <div className={`${CELL} bg-emerald-500/80`} />
                        <div className={`${CELL} bg-emerald-500`} />
                        <span>More</span>
                    </div>
                </div>

                {/* Year picker */}
                <div className="flex sm:flex-col gap-1 sm:gap-0.5 sm:w-16 sm:shrink-0">
                    {years.map((y) => (
                        <button
                            key={y}
                            type="button"
                            onClick={() => setYear(y)}
                            className={`px-3 py-1 rounded text-xs transition ${
                                y === year
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-500/30"
                                    : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent"
                            }`}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
