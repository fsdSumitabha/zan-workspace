"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import clsx from "clsx"
import { Search } from "lucide-react"
import { UPLOAD_ROW_RESULT, UPLOAD_ROW_RESULT_META, type UploadRowResult } from "@/constants/leadSourceStatus"
import type { LeadSourceUploadReport } from "@/types/leadSource"
import { LEAD_SOURCES_PAGE } from "./api"

const PAGE_SIZE = 100

/** "imported" includes rows imported with warnings, the same as the tiles above. */
type Filter = "all" | "imported" | UploadRowResult

function matches(filter: Filter, result: number): boolean {
    if (filter === "all") return true
    if (filter === "imported") return result !== UPLOAD_ROW_RESULT.SKIPPED
    return result === filter
}

/**
 * The upload report as a spreadsheet-like grid: one line per sheet row, the
 * row number on the left like Excel, the result and the reason, then every
 * column of the file under its own header.
 *
 * The header row and the row numbers stay in place while scrolling, so a
 * wide sheet can be read on a laptop. Rows are shown 100 at a time.
 */
export default function ReportGrid({ report }: { report: LeadSourceUploadReport }) {
    const [filter, setFilter] = useState<Filter>("all")
    const [query, setQuery] = useState("")
    const [page, setPage] = useState(1)

    const counts = useMemo(() => {
        const c = { all: report.rows.length, 10: 0, 20: 0, 30: 0 }
        for (const r of report.rows) c[r.result as UploadRowResult]++
        return c
    }, [report.rows])

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase()
        return report.rows.filter((r) => {
            if (!matches(filter, r.result)) return false
            if (!q) return true
            return (
                String(r.n) === q ||
                r.values.some((v) => v.toLowerCase().includes(q)) ||
                r.messages.some((m) => m.toLowerCase().includes(q))
            )
        })
    }, [report.rows, filter, query])

    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const current = Math.min(page, pages)
    const slice = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

    const chips: Array<{ value: Filter; label: string; count: number }> = [
        { value: "all", label: "All rows", count: counts.all },
        { value: "imported", label: "Imported", count: counts[10] + counts[20] },
        { value: UPLOAD_ROW_RESULT.WARNED, label: "With warnings", count: counts[20] },
        { value: UPLOAD_ROW_RESULT.SKIPPED, label: "Skipped", count: counts[30] },
    ]

    const th =
        "sticky top-0 z-20 whitespace-nowrap border-b border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
    const td =
        "max-w-[16rem] truncate whitespace-nowrap border-b border-r border-slate-200 px-2 py-1 text-neutral-800 dark:border-neutral-800 dark:text-neutral-200"

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                        <button
                            key={chip.label}
                            type="button"
                            onClick={() => {
                                setFilter(chip.value)
                                setPage(1)
                            }}
                            className={clsx(
                                "rounded-full border px-3 py-1 text-xs font-medium transition",
                                filter === chip.value
                                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                                    : "border-slate-300 text-neutral-700 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            )}
                        >
                            {chip.label} <span className="tabular-nums opacity-70">{chip.count}</span>
                        </button>
                    ))}
                </div>
                <label className="relative ml-auto w-full sm:w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                    <input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setPage(1)
                        }}
                        placeholder="Find in the report"
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                </label>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                        <tr>
                            <th className={clsx(th, "left-0 z-30 w-12 text-center text-neutral-500")}>Row</th>
                            <th className={th}>Result</th>
                            <th className={th}>Notes</th>
                            {report.columns.map((c, i) => (
                                <th key={`${c.key}-${i}`} className={th} title={c.known ? c.label : "Not in the template. Kept as extra data."}>
                                    {c.header}
                                    {!c.known && <span className="ml-1 font-normal text-neutral-400">(extra)</span>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {slice.map((row) => {
                            const meta = UPLOAD_ROW_RESULT_META[row.result as UploadRowResult]
                            return (
                                <tr key={row.n} className={meta?.row}>
                                    <td className="sticky left-0 z-10 w-12 border-b border-r border-slate-300 bg-slate-100 px-2 py-1 text-center tabular-nums text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                                        {row.sourceId ? (
                                            <Link href={`${LEAD_SOURCES_PAGE}/${row.sourceId}`} className="text-blue-600 hover:underline dark:text-blue-400" title="Open this lead source">
                                                {row.n}
                                            </Link>
                                        ) : (
                                            row.n
                                        )}
                                    </td>
                                    <td className={td}>
                                        <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-semibold", meta?.chip)}>{meta?.label}</span>
                                    </td>
                                    <td className={clsx(td, "max-w-[22rem]")} title={row.messages.join("\n")}>
                                        {row.messages.join(" · ") || <span className="text-neutral-400">—</span>}
                                    </td>
                                    {report.columns.map((c, i) => (
                                        <td key={`${c.key}-${i}`} className={td} title={row.values[i]}>
                                            {row.values[i]}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                        {slice.length === 0 && (
                            <tr>
                                <td colSpan={3 + report.columns.length} className="px-3 py-8 text-center text-sm text-neutral-500">
                                    No rows match.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <button
                        type="button"
                        disabled={current === 1}
                        onClick={() => setPage(current - 1)}
                        className="rounded bg-neutral-200 px-3 py-1 text-neutral-700 hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                        Previous
                    </button>
                    <span className="text-neutral-500 tabular-nums">
                        Rows {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, visible.length)} of {visible.length}
                    </span>
                    <button
                        type="button"
                        disabled={current === pages}
                        onClick={() => setPage(current + 1)}
                        className="rounded bg-neutral-200 px-3 py-1 text-neutral-700 hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    )
}
