"use client"

import type { ReactNode } from "react"
import clsx from "clsx"
import type { LeadSourceCounts, LeadSourceView } from "@/types/leadSource"

const TABS: Array<{ view: Exclude<LeadSourceView, "day">; label: string; hint: string }> = [
    { view: "today", label: "Today", hint: "Today's sources, callbacks that are due, and sources left over from earlier days" },
    { view: "upcoming", label: "Upcoming", hint: "Open sources set for a later day" },
    { view: "unscheduled", label: "No day", hint: "Open sources that have no day yet" },
    { view: "closed", label: "Closed", hint: "Not Interested, Wrong Number and Converted" },
    { view: "all", label: "All", hint: "Every lead source" },
]

/**
 * The view tabs, with room at the end for a filter, so the list starts
 * higher on the screen. On a phone the tabs scroll sideways and the filter
 * goes under them.
 */
export default function ViewTabs({
    view,
    counts,
    onChange,
    trailing,
}: {
    view: LeadSourceView
    counts: LeadSourceCounts | null
    onChange: (view: Exclude<LeadSourceView, "day">) => void
    trailing?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            {/* w-0 + min-w-full: the tabs never make the page wider than the
                screen. They scroll inside their own box instead. */}
            <div className="w-0 min-w-full overflow-x-auto sm:min-w-0 sm:flex-1" role="tablist" aria-label="Views">
                <div className="flex w-max gap-1">
                    {TABS.map((tab) => {
                        const active = view === tab.view
                        const count = counts?.[tab.view]
                        return (
                            <button
                                key={tab.view}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                title={tab.hint}
                                onClick={() => onChange(tab.view)}
                                className={clsx(
                                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                                    active
                                        ? "bg-emerald-600 text-white shadow-sm"
                                        : "text-neutral-600 hover:bg-slate-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                                )}
                            >
                                {tab.label}
                                {count !== undefined && (
                                    <span
                                        className={clsx(
                                            "min-w-[1.5rem] rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums",
                                            active
                                                ? "bg-white/25 text-white"
                                                : "bg-slate-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                                        )}
                                    >
                                        {count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
            {trailing && <div className="w-full px-1 pb-1 sm:w-44 sm:p-0 sm:pr-0.5">{trailing}</div>}
        </div>
    )
}
