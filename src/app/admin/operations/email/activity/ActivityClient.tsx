"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import { Activity, RefreshCw, Search } from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import {
    ATTEMPT_OUTCOME,
    ATTEMPT_OUTCOME_META,
    ERROR_CLASS_META,
    type AttemptOutcome,
    type ErrorClass,
} from "@/constants/emailStatus"

const API = "/api/admin/operations/email/activity"

interface AttemptRow {
    _id: string
    campaignId: string
    campaignName: string
    recipientId: string
    email: string
    attemptNo: number
    workerId: string
    startedAt: string
    durationMs: number | null
    outcome: number
    smtpCode: number | null
    smtpResponse: string
    errorClass: number | null
    errorMessage: string
}

interface Latency {
    samples: number
    p50: number
    p95: number
    p99: number
}

const WINDOWS = [
    { hours: 1, label: "Last hour" },
    { hours: 24, label: "Last day" },
    { hours: 24 * 7, label: "Last week" },
    { hours: 24 * 30, label: "Last month" },
]

export default function ActivityClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<AttemptRow[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [latency, setLatency] = useState<Latency | null>(null)
    const [total, setTotal] = useState(0)

    const [hours, setHours] = useState(24 * 7)
    const [outcome, setOutcome] = useState<AttemptOutcome | null>(null)
    const [search, setSearch] = useState("")

    /**
     * One campaign, when a report linked here.
     *
     * The API has always accepted this, so without reading it the link
     * from a report would land on the whole log and quietly show every
     * campaign's attempts under a heading about one.
     */
    const params = useSearchParams()
    const campaignId = params.get("campaign") ?? ""

    const load = useCallback(
        async (h: number, o: AttemptOutcome | null, q: string) => {
            const url = new URL(API, window.location.origin)
            url.searchParams.set("hours", String(h))
            if (o !== null) url.searchParams.set("outcome", String(o))
            if (q) url.searchParams.set("search", q)
            if (campaignId) url.searchParams.set("campaign", campaignId)

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to load the activity")
            }

            setRows(json.data as AttemptRow[])
            setCounts(json.counts ?? {})
            setLatency(json.latency ?? null)
            setTotal(json.pagination?.total ?? 0)
        },
        [router, campaignId]
    )

    useEffect(() => {
        const timer = setTimeout(() => {
            load(hours, outcome, search)
                .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Failed to load")
                )
                .finally(() => setLoading(false))
        }, 300)

        return () => clearTimeout(timer)
    }, [hours, outcome, search, load])

    if (forbidden) return <AccessDenied message={forbidden} />

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Delivery activity
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Every send attempt and what the mail server replied.
                        Kept for 90 days.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setLoading(true)
                        load(hours, outcome, search).finally(() =>
                            setLoading(false)
                        )
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {/* When a report linked here, say so. A filtered log that
                looks unfiltered is read as the whole picture. */}
            {campaignId && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                    <span>
                        Showing one campaign only
                        {rows[0]?.campaignName
                            ? `: ${rows[0].campaignName}`
                            : ""}
                        .
                    </span>
                    <Link
                        href="/admin/operations/email/activity"
                        className="font-medium underline"
                    >
                        Show every campaign
                    </Link>
                </div>
            )}

            {/* Latency, which is what tells somebody whether the provider
                is slow or whether something here is. */}
            {latency && latency.samples > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Attempts" value={total.toLocaleString()} />
                    <Stat label="p50 latency" value={`${latency.p50} ms`} />
                    <Stat label="p95 latency" value={`${latency.p95} ms`} />
                    <Stat
                        label="p99 latency"
                        value={`${latency.p99} ms`}
                        tone={latency.p99 > 5_000 ? "warn" : undefined}
                    />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <select
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                >
                    {WINDOWS.map((w) => (
                        <option key={w.hours} value={w.hours}>
                            {w.label}
                        </option>
                    ))}
                </select>

                <div className="flex flex-wrap gap-1">
                    <Chip
                        active={outcome === null}
                        label="All"
                        onClick={() => setOutcome(null)}
                    />
                    {(
                        Object.values(ATTEMPT_OUTCOME) as AttemptOutcome[]
                    ).map((value) => (
                        <Chip
                            key={value}
                            active={outcome === value}
                            label={ATTEMPT_OUTCOME_META[value].label}
                            count={counts[String(value)]}
                            onClick={() => setOutcome(value)}
                        />
                    ))}
                </div>

                <div className="relative min-w-[160px] flex-1">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search an address"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                </div>
            </div>

            {loading ? (
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <Activity size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        Nothing in this window
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        Attempts appear here as soon as a campaign starts
                        sending.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
                                <th className="px-3 py-2 font-medium">Time</th>
                                <th className="px-3 py-2 font-medium">Recipient</th>
                                <th className="px-3 py-2 font-medium">Campaign</th>
                                <th className="px-3 py-2 font-medium">Try</th>
                                <th className="px-3 py-2 font-medium">Outcome</th>
                                <th className="px-3 py-2 font-medium">Took</th>
                                <th className="px-3 py-2 font-medium">
                                    What the server said
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                            {rows.map((row) => {
                                const meta =
                                    ATTEMPT_OUTCOME_META[
                                        row.outcome as AttemptOutcome
                                    ]
                                const failed =
                                    row.outcome !== ATTEMPT_OUTCOME.ACCEPTED

                                return (
                                    <tr key={row._id}>
                                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 dark:text-neutral-400">
                                            {new Date(
                                                row.startedAt
                                            ).toLocaleTimeString()}
                                        </td>
                                        <td className="max-w-[180px] truncate px-3 py-2 text-slate-900 dark:text-white">
                                            {row.email || "—"}
                                        </td>
                                        <td className="max-w-[140px] truncate px-3 py-2">
                                            <Link
                                                href={`/admin/operations/email/campaigns/${row.campaignId}`}
                                                className="text-xs text-slate-600 hover:text-emerald-700 dark:text-neutral-400 dark:hover:text-emerald-400"
                                            >
                                                {row.campaignName || "—"}
                                            </Link>
                                        </td>
                                        <td className="px-3 py-2 tabular-nums text-xs text-slate-500 dark:text-neutral-500">
                                            {row.attemptNo}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={clsx(
                                                    "rounded px-1.5 py-0.5 text-xs font-medium",
                                                    failed
                                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                                                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                                )}
                                            >
                                                {meta?.label ?? row.outcome}
                                            </span>
                                            {row.errorClass !== null && (
                                                <span className="ml-1 text-[10px] text-slate-400">
                                                    {
                                                        ERROR_CLASS_META[
                                                            row.errorClass as ErrorClass
                                                        ]?.label
                                                    }
                                                </span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-slate-500 dark:text-neutral-500">
                                            {row.durationMs !== null
                                                ? `${row.durationMs} ms`
                                                : "—"}
                                        </td>
                                        <td className="max-w-[280px] px-3 py-2">
                                            {/* The provider's own words,
                                                verbatim. Paraphrasing an
                                                SMTP response loses the
                                                detail that explains it. */}
                                            <span
                                                title={
                                                    row.smtpResponse ||
                                                    row.errorMessage
                                                }
                                                className={clsx(
                                                    "line-clamp-2 text-xs",
                                                    failed
                                                        ? "text-rose-600 dark:text-rose-400"
                                                        : "text-slate-500 dark:text-neutral-500"
                                                )}
                                            >
                                                {row.smtpCode
                                                    ? `${row.smtpCode} · `
                                                    : ""}
                                                {row.smtpResponse ||
                                                    row.errorMessage ||
                                                    "accepted"}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string
    value: string
    tone?: "warn"
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div
                className={clsx(
                    "text-lg font-semibold tabular-nums",
                    tone === "warn"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-900 dark:text-white"
                )}
            >
                {value}
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">
                {label}
            </div>
        </div>
    )
}

function Chip({
    active,
    label,
    count,
    onClick,
}: {
    active: boolean
    label: string
    count?: number
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                active
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            )}
        >
            {label}
            {count !== undefined && count > 0 && (
                <span
                    className={clsx(
                        "rounded px-1 text-[10px]",
                        active ? "bg-white/20" : "bg-slate-200 dark:bg-neutral-700"
                    )}
                >
                    {count}
                </span>
            )}
        </button>
    )
}
