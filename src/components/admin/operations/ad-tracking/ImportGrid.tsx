"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import clsx from "clsx"
import { Search } from "lucide-react"
import {
    LEAD_IMPORT_ROW_RESULT,
    LEAD_IMPORT_ROW_RESULT_META,
    isImportedResult,
    type LeadImportRowResult,
} from "@/constants/adTracking"
import type { LeadImportColumnView, LeadImportRowView } from "@/types/adTracking"

const PAGE_SIZE = 100

type Filter = "all" | "imported" | LeadImportRowResult

function matches(filter: Filter, result: number): boolean {
    if (filter === "all") return true
    if (filter === "imported") return isImportedResult(result)
    return result === filter
}

/**
 * The import as a spreadsheet: one line per sheet row, the row number on
 * the left like Excel, the result and the reason, then every column of the
 * file under its own header. The same grid as the lead source upload
 * report, so it reads the same.
 *
 * `preview` is the check before the import: the results say "Will import"
 * instead of "Imported", and no row links to a lead yet.
 */
export default function ImportGrid({
    columns,
    rows,
    preview = false,
}: {
    columns: LeadImportColumnView[]
    rows: LeadImportRowView[]
    preview?: boolean
}) {
    const [filter, setFilter] = useState<Filter>("all")
    const [query, setQuery] = useState("")
    const [page, setPage] = useState(1)

    const counts = useMemo(() => {
        const c = { all: rows.length, 10: 0, 20: 0, 30: 0, 40: 0 }
        for (const r of rows) c[r.result as LeadImportRowResult]++
        return c
    }, [rows])

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase()
        return rows.filter((r) => {
            if (!matches(filter, r.result)) return false
            if (!q) return true
            return String(r.n) === q || r.values.some((v) => v.toLowerCase().includes(q)) || r.messages.some((m) => m.toLowerCase().includes(q))
        })
    }, [rows, filter, query])

    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const current = Math.min(page, pages)
    const slice = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

    const chips: Array<{ value: Filter; label: string; count: number }> = [
        { value: "all", label: "All rows", count: counts.all },
        { value: "imported", label: preview ? "Will import" : "Imported", count: counts[10] + counts[20] },
        { value: LEAD_IMPORT_ROW_RESULT.WARNED, label: "With warnings", count: counts[20] },
        { value: LEAD_IMPORT_ROW_RESULT.DUPLICATE, label: "Duplicates", count: counts[30] },
        { value: LEAD_IMPORT_ROW_RESULT.FAILED, label: preview ? "Will fail" : "Failed", count: counts[40] },
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
                        placeholder="Find in the rows"
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
                            {columns.map((c, i) => (
                                <th
                                    key={`${c.key}-${i}`}
                                    className={th}
                                    title={c.known ? c.label : "A form question. The answer goes into the lead's first note."}
                                >
                                    {c.header}
                                    {!c.known && <span className="ml-1 font-normal text-sky-600 dark:text-sky-400">(question)</span>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {slice.map((row) => {
                            const meta = LEAD_IMPORT_ROW_RESULT_META[row.result as LeadImportRowResult]
                            return (
                                <tr key={row.n} className={meta?.row}>
                                    <td className="sticky left-0 z-10 w-12 border-b border-r border-slate-300 bg-slate-100 px-2 py-1 text-center tabular-nums text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                                        {row.leadId ? (
                                            <Link
                                                href={`/admin/operations/leads/${row.leadId}`}
                                                className="text-blue-600 hover:underline dark:text-blue-400"
                                                title="Open this lead"
                                            >
                                                {row.n}
                                            </Link>
                                        ) : (
                                            row.n
                                        )}
                                    </td>
                                    <td className={td}>
                                        <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-semibold", meta?.chip)}>
                                            {preview ? meta?.preview : meta?.label}
                                        </span>
                                    </td>
                                    <td className={clsx(td, "max-w-[22rem]")} title={row.messages.join("\n")}>
                                        {row.messages.join(" · ") || <span className="text-neutral-400">—</span>}
                                    </td>
                                    {columns.map((c, i) => (
                                        <td key={`${c.key}-${i}`} className={td} title={row.values[i]}>
                                            {row.values[i]}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                        {slice.length === 0 && (
                            <tr>
                                <td colSpan={3 + columns.length} className="px-3 py-8 text-center text-sm text-neutral-500">
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
                    <span className="tabular-nums text-neutral-500">
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
