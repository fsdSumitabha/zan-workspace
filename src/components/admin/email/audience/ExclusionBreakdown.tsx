"use client"

import { useState } from "react"
import { AlertTriangle, ChevronDown, Users } from "lucide-react"
import type { AudiencePreviewView } from "@/types/email"

/**
 * Where everybody who will not receive the campaign went.
 *
 * ## Why this screen exists
 *
 * When 712 leads match a filter and 486 get the campaign, somebody has to
 * be able to see the other 226. Without that, the first reaction is "the
 * tool is broken" and the second is to stop trusting the numbers. The
 * arithmetic is laid out so it visibly adds up, and each line can be opened
 * to show real examples.
 */
export default function ExclusionBreakdown({
    preview,
    loading,
}: {
    preview: AudiencePreviewView | null
    loading: boolean
}) {
    const [open, setOpen] = useState<string | null>(null)

    if (loading && !preview) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-neutral-800" />
                <div className="mt-3 h-24 animate-pulse rounded bg-slate-100 dark:bg-neutral-800/60" />
            </div>
        )
    }

    if (!preview) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                Add a rule to see who this reaches.
            </div>
        )
    }

    const excludedTotal = preview.breakdown.reduce((a, b) => a + b.count, 0)

    return (
        <div
            className={`rounded-xl border bg-white shadow-sm transition dark:bg-neutral-900 ${loading
                ? "border-slate-200 opacity-60 dark:border-neutral-800"
                : "border-slate-200 dark:border-neutral-800"
                }`}
        >
            {/* The headline number */}
            <div className="border-b border-slate-100 px-4 py-4 text-center dark:border-neutral-800">
                <div className="text-3xl font-semibold text-slate-900 dark:text-white">
                    {preview.eligibleTotal.toLocaleString()}
                </div>
                <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-neutral-400">
                    <Users size={13} />
                    {preview.eligibleTotal === 1
                        ? "person will receive this"
                        : "people will receive this"}
                </div>
            </div>

            {preview.truncated && (
                <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                        This audience is very large and the count was cut short.
                        The real number is higher. Narrow the rules before
                        scheduling.
                    </span>
                </div>
            )}

            {preview.warning && (
                <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{preview.warning}</span>
                </div>
            )}

            {/* The arithmetic */}
            <div className="px-4 py-3 font-mono text-xs">
                <Row
                    label="Matched records"
                    value={preview.matchedTotal}
                    bold
                />

                {preview.breakdown.map((item) => {
                    const isOpen = open === item.key
                    const hasSamples = item.samples.length > 0

                    return (
                        <div key={item.key}>
                            <button
                                type="button"
                                disabled={!hasSamples}
                                onClick={() => setOpen(isOpen ? null : item.key)}
                                className={`flex w-full items-center gap-1 py-1 text-left transition ${hasSamples
                                    ? "cursor-pointer hover:text-slate-900 dark:hover:text-white"
                                    : "cursor-default"
                                    }`}
                            >
                                <span className="w-3 shrink-0 text-slate-400">
                                    {hasSamples && (
                                        <ChevronDown
                                            size={11}
                                            className={`transition-transform ${isOpen ? "" : "-rotate-90"
                                                }`}
                                        />
                                    )}
                                </span>
                                <span className="flex-1 truncate text-slate-600 dark:text-neutral-400">
                                    {item.label}
                                </span>
                                <span className="tabular-nums text-rose-600 dark:text-rose-400">
                                    −{item.count.toLocaleString()}
                                </span>
                            </button>

                            {isOpen && (
                                <ul className="mb-1 ml-4 space-y-0.5 border-l border-slate-200 pl-3 dark:border-neutral-700">
                                    {item.samples.map((s, i) => (
                                        <li
                                            key={i}
                                            className="truncate text-[11px] text-slate-500 dark:text-neutral-500"
                                        >
                                            {s}
                                        </li>
                                    ))}
                                    {item.count > item.samples.length && (
                                        <li className="text-[11px] text-slate-400 dark:text-neutral-600">
                                            and{" "}
                                            {(
                                                item.count - item.samples.length
                                            ).toLocaleString()}{" "}
                                            more
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    )
                })}

                {excludedTotal === 0 && preview.matchedTotal > 0 && (
                    <div className="py-1 text-slate-500 dark:text-neutral-500">
                        Nothing excluded.
                    </div>
                )}

                <div className="my-1.5 border-t border-dashed border-slate-300 dark:border-neutral-700" />

                <Row
                    label="Will receive this"
                    value={preview.eligibleTotal}
                    bold
                    positive
                />
            </div>

            {/* Real people, so the number is not just a number */}
            {preview.sample.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3 dark:border-neutral-800">
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                        For example
                    </div>
                    <ul className="space-y-0.5">
                        {preview.sample.slice(0, 5).map((r, i) => (
                            <li
                                key={i}
                                className="truncate text-xs text-slate-600 dark:text-neutral-400"
                            >
                                {r.name ? `${r.name} · ` : ""}
                                <span className="text-slate-500 dark:text-neutral-500">
                                    {r.email}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

function Row({
    label,
    value,
    bold,
    positive,
}: {
    label: string
    value: number
    bold?: boolean
    positive?: boolean
}) {
    return (
        <div className="flex items-center gap-1 py-1">
            <span className="w-3 shrink-0" />
            <span
                className={`flex-1 truncate ${bold
                    ? "font-semibold text-slate-900 dark:text-white"
                    : "text-slate-600 dark:text-neutral-400"
                    }`}
            >
                {label}
            </span>
            <span
                className={`tabular-nums ${positive
                    ? "font-semibold text-emerald-600 dark:text-emerald-400"
                    : bold
                        ? "font-semibold text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-neutral-400"
                    }`}
            >
                {value.toLocaleString()}
            </span>
        </div>
    )
}
