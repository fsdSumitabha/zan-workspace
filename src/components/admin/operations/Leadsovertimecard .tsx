"use client"

import { useState } from "react"
import { ChevronRight, TrendingUp } from "lucide-react"

/* ------------------------------------------------------------------ */
/* Types — mirror the `leads.overTime` slice of the stats payload      */
/* ------------------------------------------------------------------ */

interface MonthBucket {
    month: number // 1–12
    leads: number
    converted: number
}

interface YearBucket {
    year: number
    leads: number
    converted: number
    months: MonthBucket[]
}

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * Turn the sparse month list from the API (only months that have leads)
 * into a dense 12-slot array. Missing months become zero-rows, which the
 * UI renders dimmed.
 */
function fillMonths(months: MonthBucket[]): MonthBucket[] {
    const byMonth = new Map(months.map((m) => [m.month, m]))
    return Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1
        return (
            byMonth.get(monthNum) ?? {
                month: monthNum,
                leads: 0,
                converted: 0,
            }
        )
    })
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export default function LeadsOverTimeCard({
    data,
}: {
    data: YearBucket[]
}) {
    const latestYear = data.length ? Math.max(...data.map((y) => y.year)) : null
    const [open, setOpen] = useState<Set<number>>(
        () => new Set(latestYear !== null ? [latestYear] : [])
    )

    const toggle = (year: number) =>
        setOpen((prev) => {
            const next = new Set(prev)
            next.has(year) ? next.delete(year) : next.add(year)
            return next
        })

    const years = [...data].sort((a, b) => b.year - a.year)

    return (
        <div className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
            {/* Header */}
            <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <TrendingUp className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                        Leads over time
                    </h3>
                </div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 dark:text-neutral-500">
                    Monthly
                </span>
            </div>

            {years.length === 0 ? (
                <div className="mt-6 flex items-center justify-center h-32 text-sm text-neutral-500">
                    No lead history yet
                </div>
            ) : (
                <div className="mt-4 space-y-2">
                    {years.map((yr) => (
                        <YearBlock
                            key={yr.year}
                            year={yr}
                            isOpen={open.has(yr.year)}
                            onToggle={() => toggle(yr.year)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* One collapsible year, containing the month table                    */
/* ------------------------------------------------------------------ */

function YearBlock({
    year,
    isOpen,
    onToggle,
}: {
    year: YearBucket
    isOpen: boolean
    onToggle: () => void
}) {
    const months = fillMonths(year.months)
    const convPct =
        year.leads > 0 ? Math.round((year.converted / year.leads) * 100) : 0

    return (
        <div className="rounded-lg border border-slate-100 dark:border-neutral-800/70 overflow-hidden">
            {/* Year header row */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition text-left"
            >
                <ChevronRight
                    className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${
                        isOpen ? "rotate-90" : ""
                    }`}
                />
                <span className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums w-14">
                    {year.year}
                </span>
                <div className="flex-1 flex items-center gap-4 justify-end text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {year.leads}
                        </span>{" "}
                        leads
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                        {year.converted} conv · {convPct}%
                    </span>
                </div>
            </button>

            {isOpen && (
                <div className="border-t border-slate-100 dark:border-neutral-800/70 p-3">
                    <MonthTable months={months} />
                </div>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Month table                                                         */
/*                                                                     */
/* One data structure, two layouts via CSS:                            */
/*  - Desktop (md+): months are COLUMNS. 3 rows: Month / Total / Conv. */
/*  - Mobile: flips to ROWS. 3 columns: Month / Total / Conv.          */
/* Empty months (0 leads) are dimmed.                                  */
/* ------------------------------------------------------------------ */

function MonthTable({ months }: { months: MonthBucket[] }) {
    return (
        <>
            {/* ---------- Desktop: months across the top ---------- */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <tbody>
                        {/* Month labels */}
                        <tr>
                            <th className="text-left font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider text-[10px] pr-3 pb-2 whitespace-nowrap">
                                Month
                            </th>
                            {months.map((m) => (
                                <td
                                    key={m.month}
                                    className={`text-center font-semibold pb-2 px-1 ${
                                        m.leads === 0
                                            ? "text-neutral-300 dark:text-neutral-600"
                                            : "text-neutral-700 dark:text-neutral-300"
                                    }`}
                                >
                                    {MONTH_NAMES[m.month - 1]}
                                </td>
                            ))}
                        </tr>

                        {/* Total leads */}
                        <tr className="border-t border-slate-100 dark:border-neutral-800">
                            <th className="text-left font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider text-[10px] pr-3 py-2 whitespace-nowrap">
                                Total
                            </th>
                            {months.map((m) => (
                                <td
                                    key={m.month}
                                    className={`text-center tabular-nums py-2 px-1 ${
                                        m.leads === 0
                                            ? "text-neutral-300 dark:text-neutral-600"
                                            : "font-semibold text-neutral-900 dark:text-white"
                                    }`}
                                >
                                    {m.leads === 0 ? "—" : m.leads}
                                </td>
                            ))}
                        </tr>

                        {/* Converted */}
                        <tr className="border-t border-slate-100 dark:border-neutral-800">
                            <th className="text-left font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider text-[10px] pr-3 pt-2 whitespace-nowrap">
                                Converted
                            </th>
                            {months.map((m) => (
                                <td
                                    key={m.month}
                                    className={`text-center tabular-nums pt-2 px-1 ${
                                        m.leads === 0
                                            ? "text-neutral-300 dark:text-neutral-600"
                                            : "font-semibold text-emerald-600 dark:text-emerald-400"
                                    }`}
                                >
                                    {m.leads === 0 ? "—" : m.converted}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ---------- Mobile: months down the side ---------- */}
            <div className="md:hidden">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                            <th className="text-left font-semibold pb-2">
                                Month
                            </th>
                            <th className="text-right font-semibold pb-2">
                                Total
                            </th>
                            <th className="text-right font-semibold pb-2">
                                Converted
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {months.map((m) => {
                            const empty = m.leads === 0
                            return (
                                <tr
                                    key={m.month}
                                    className="border-t border-slate-100 dark:border-neutral-800"
                                >
                                    <td
                                        className={`text-left py-2 font-semibold ${
                                            empty
                                                ? "text-neutral-300 dark:text-neutral-600"
                                                : "text-neutral-700 dark:text-neutral-300"
                                        }`}
                                    >
                                        {MONTH_NAMES[m.month - 1]}
                                    </td>
                                    <td
                                        className={`text-right py-2 tabular-nums ${
                                            empty
                                                ? "text-neutral-300 dark:text-neutral-600"
                                                : "font-semibold text-neutral-900 dark:text-white"
                                        }`}
                                    >
                                        {empty ? "—" : m.leads}
                                    </td>
                                    <td
                                        className={`text-right py-2 tabular-nums ${
                                            empty
                                                ? "text-neutral-300 dark:text-neutral-600"
                                                : "font-semibold text-emerald-600 dark:text-emerald-400"
                                        }`}
                                    >
                                        {empty ? "—" : m.converted}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </>
    )
}