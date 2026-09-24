"use client"

import clsx from "clsx"
import { addDays, formatDay, todayString } from "@/lib/lead-sources/day"

/**
 * Picks the day to call on: no day, today, tomorrow, or any later date.
 * The value is "YYYY-MM-DD" in the person's own time zone, or null.
 */
export default function DayChoice({
    value,
    onChange,
    allowNone = true,
    noneLabel = "No day",
}: {
    value: string | null
    onChange: (day: string | null) => void
    allowNone?: boolean
    noneLabel?: string
}) {
    const today = todayString()
    const tomorrow = addDays(today, 1)
    const custom = value !== null && value !== today && value !== tomorrow

    const chip = (active: boolean) =>
        clsx(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
            active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 text-neutral-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        )

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Day">
                {allowNone && (
                    <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={chip(value === null)}>
                        {noneLabel}
                    </button>
                )}
                <button type="button" role="radio" aria-checked={value === today} onClick={() => onChange(today)} className={chip(value === today)}>
                    Today
                </button>
                <button type="button" role="radio" aria-checked={value === tomorrow} onClick={() => onChange(tomorrow)} className={chip(value === tomorrow)}>
                    Tomorrow
                </button>
                <label className={clsx(chip(custom), "inline-flex cursor-pointer items-center gap-2")}>
                    <span>{custom && value ? formatDay(value, today) : "Other day"}</span>
                    <input
                        type="date"
                        min={today}
                        max={addDays(today, 366)}
                        value={custom && value ? value : ""}
                        onChange={(e) => e.target.value && onChange(e.target.value)}
                        className={clsx(
                            "w-[8.5rem] rounded border-0 bg-transparent p-0 text-sm focus:outline-none [color-scheme:light] dark:[color-scheme:dark]",
                            custom ? "text-white" : "text-neutral-500 dark:text-neutral-400"
                        )}
                        aria-label="Pick a day"
                    />
                </label>
            </div>
        </div>
    )
}
