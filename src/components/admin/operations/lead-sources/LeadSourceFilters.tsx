"use client"

import Link from "next/link"
import { useState } from "react"
import clsx from "clsx"
import { FileSpreadsheet, X } from "lucide-react"
import { LEAD_SOURCE_STATUS_META, LEAD_SOURCE_STATUSES } from "@/constants/leadSourceStatus"
import { useAssignees } from "./AssigneeSelect"
import { LEAD_SOURCES_PAGE } from "./api"

const SELECT =
    "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-neutral-700 dark:bg-neutral-900"
const ACTIVE = "text-neutral-900 dark:text-neutral-100"
const MUTED = "text-neutral-500 dark:text-neutral-500"

export interface FilterValues {
    status: string
    assignee: string
    day: string
    upload: string
}

/** The status filter. It sits at the end of the view tabs, for everyone. */
export function StatusFilter({ value, onChange }: { value: string; onChange: (status: string) => void }) {
    return (
        <select
            aria-label="Status"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={clsx(SELECT, value ? ACTIVE : MUTED)}
        >
            <option value="">All statuses</option>
            {LEAD_SOURCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                    {LEAD_SOURCE_STATUS_META[s].label}
                </option>
            ))}
        </select>
    )
}

/**
 * Filters for managers, who see the whole team: the person, one exact day,
 * and one upload. Every value lives in the URL, like the other list pages,
 * so a reload or a shared link opens the same list.
 */
export default function LeadSourceFilters({
    values,
    onChange,
    onClear,
}: {
    values: FilterValues
    onChange: (patch: Partial<FilterValues>) => void
    onClear: () => void
}) {
    const { people } = useAssignees([])
    const [dayFocused, setDayFocused] = useState(false)
    const hasActive = Boolean(values.status || values.assignee || values.day || values.upload)

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                    aria-label="Person"
                    value={values.assignee}
                    onChange={(e) => onChange({ assignee: e.target.value })}
                    className={clsx(SELECT, values.assignee ? ACTIVE : MUTED)}
                >
                    <option value="">Everyone</option>
                    <option value="me">Assigned to me</option>
                    <option value="none">Not assigned</option>
                    {people.map((p) => (
                        <option key={p._id} value={p._id}>
                            {p.name}
                        </option>
                    ))}
                </select>

                {/* A date box with no value shows the browser's own
                    "dd-mm-yyyy". Its text is hidden until it has a value or
                    the focus, and a plain label shows instead. */}
                <label className="relative block" title="Show everything set for one day, in any status">
                    <span className="sr-only">One day</span>
                    <input
                        type="date"
                        value={values.day}
                        onChange={(e) => onChange({ day: e.target.value })}
                        onFocus={() => setDayFocused(true)}
                        onBlur={() => setDayFocused(false)}
                        className={clsx(
                            SELECT,
                            "[color-scheme:light] dark:[color-scheme:dark]",
                            values.day ? ACTIVE : dayFocused ? MUTED : "text-transparent"
                        )}
                    />
                    {!values.day && !dayFocused && (
                        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-neutral-500">
                            One day…
                        </span>
                    )}
                </label>

                <div className="col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1">
                    <Link
                        href={`${LEAD_SOURCES_PAGE}/uploads`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        Uploads
                    </Link>
                    {hasActive && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                            <X className="h-4 w-4" />
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {values.upload && (
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    Showing one upload only.
                    <button type="button" onClick={() => onChange({ upload: "" })} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                        Show all uploads
                    </button>
                </div>
            )}

            {values.day && (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Showing every source set for this day, in any status. Clear the day to go back to the tabs.
                </p>
            )}
        </div>
    )
}
