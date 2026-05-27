"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import DateField from "./filters/DateField"

const FIELD = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"

/** Solid text — used when the field holds an actively-chosen value. */
const TEXT_ACTIVE = "text-neutral-900 dark:text-neutral-100"
/** Muted text — makes a default/unset value read like a placeholder. */
const TEXT_PLACEHOLDER = "text-neutral-600 dark:text-neutral-500"

/** Earliest selectable date — the pipeline starts in 2026. */
const MIN_DATE = "2026-01-01"

/** Local "today" as YYYY-MM-DD (avoids the UTC drift of toISOString). */
function todayLocal(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

/** Clamp a YYYY-MM-DD string into [MIN_DATE, today]. */
function clampDate(value: string, today: string): string {
    if (value < MIN_DATE) return MIN_DATE
    if (value > today) return today
    return value
}

interface Props {
    /** Status code → metadata. Built from each entity's *_STATUS_META. */
    statusMeta: Record<string | number, { label: string }>
}

/**
 * URL-driven status + date-range filter shared by the leads, clients
 * and projects list pages. Writes `status`, `from`, `to` to the URL and
 * clears `page` so the list resets to page 1 on every filter change.
 *
 * Date inputs always display a value (default From = MIN_DATE, To =
 * today) so the browser never shows the empty `dd----yyyy` hint; the
 * value reads gray until the user actually picks a date.
 */
export default function ListFilters({ statusMeta }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const today = todayLocal()

    const status = searchParams.get("status") || ""
    const fromParam = searchParams.get("from") || ""
    const toParam = searchParams.get("to") || ""

    const fromValue = fromParam || MIN_DATE
    const toValue = toParam || today

    const hasActive = Boolean(status || fromParam || toParam)

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

    const onFromChange = (raw: string) => {
        update({ from: raw ? clampDate(raw, today) : "" })
    }

    const onToChange = (raw: string) => {
        // A future date snaps back to today.
        update({ to: raw ? clampDate(raw, today) : "" })
    }

    const clearAll = () => {
        const params = new URLSearchParams(searchParams.toString())
        for (const key of ["status", "from", "to", "page"]) {
            params.delete(key)
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    return (
        <div className="rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm p-3 sm:p-4">
            <div className="grid grid-cols-4 sm:grid-cols-3 gap-2 sm:gap-3">
                {/* Status */}
                <div className="col-span-2 sm:col-span-1 flex flex-col gap-1 min-w-0">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                        Status
                    </label>
                    <select
                        className={`${FIELD} ${status ? TEXT_ACTIVE : TEXT_PLACEHOLDER}`}
                        value={status}
                        onChange={(e) => update({ status: e.target.value })}
                    >
                        <option value="">All statuses</option>
                        {Object.entries(statusMeta).map(([value, meta]) => (
                            <option key={value} value={value}>
                                {meta.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* From date */}
                <div className="col-span-1">
                    <DateField
                        label="From"
                        value={fromValue}
                        min={MIN_DATE}
                        max={toValue}
                        active={!!fromParam}
                        onChange={onFromChange}
                    />
                </div>

                {/* To date */}
                <div className="col-span-1">
                    <DateField
                        label="To"
                        value={toValue}
                        min={fromValue}
                        max={today}
                        active={!!toParam}
                        onChange={onToChange}
                    />
                </div>
            </div>

            {hasActive && (
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                    >
                        <X className="w-4 h-4" />
                        Clear filters
                    </button>
                </div>
            )}
        </div>
    )
}
