"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import { BarChart3, Download, RefreshCw } from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import PerformanceChart from "@/components/admin/email/report/PerformanceChart"
import {
    CAMPAIGN_STATUS_META,
    type CampaignStatus,
} from "@/constants/emailStatus"

const API = "/api/admin/operations/email/reports"

interface Row {
    campaignId: string
    name: string
    status: number
    sentAt: string | null
    region: string
    recipients: number
    accepted: number
    failed: number
    bounced: number
    uniqueOpens: number
    uniqueClicks: number
    unsubscribes: number
    openRate: number | null
    clickRate: number | null
    bounceRate: number | null
    deliveryConfirmed: boolean
}

const WINDOWS = [
    { days: 0, label: "All time" },
    { days: 7, label: "Last week" },
    { days: 30, label: "Last month" },
    { days: 90, label: "Last 3 months" },
]

type SortKey = "sentAt" | "recipients" | "openRate" | "clickRate" | "bounceRate"

export default function ReportsClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<Row[]>([])
    const [truncated, setTruncated] = useState(false)

    const [days, setDays] = useState(0)
    const [sort, setSort] = useState<SortKey>("sentAt")

    const load = useCallback(
        async (d: number) => {
            const url = new URL(API, window.location.origin)
            url.searchParams.set("limit", "100")

            if (d > 0) {
                const from = new Date()
                from.setDate(from.getDate() - d)
                url.searchParams.set("from", from.toISOString())
            }

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to load the reports")
            }

            // Defaulted rather than trusted. A response whose shape drifts
            // should show an empty table, not take the screen down with
            // "cannot read properties of undefined".
            setRows((json.data?.rows ?? []) as Row[])
            setTruncated(Boolean(json.data?.truncated))
        },
        [router]
    )

    useEffect(() => {
        setLoading(true)
        load(days)
            .catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Failed to load")
            )
            .finally(() => setLoading(false))
    }, [days, load])

    if (forbidden) return <AccessDenied message={forbidden} />

    const sorted = rows.slice().sort((a, b) => {
        if (sort === "sentAt") {
            // Never sent sorts last, not first. A null is an absence of a
            // date, not the earliest date.
            if (!a.sentAt && !b.sentAt) return 0
            if (!a.sentAt) return 1
            if (!b.sentAt) return -1
            return b.sentAt.localeCompare(a.sentAt)
        }

        const left = a[sort]
        const right = b[sort]

        // Same reasoning: an unmeasured rate sorts last in either direction.
        if (left === null && right === null) return 0
        if (left === null) return 1
        if (right === null) return -1

        return right - left
    })

    const totals = rows.reduce(
        (acc, r) => ({
            campaigns: acc.campaigns + 1,
            recipients: acc.recipients + r.recipients,
            accepted: acc.accepted + r.accepted,
            failed: acc.failed + r.failed,
            bounced: acc.bounced + r.bounced,
            opens: acc.opens + r.uniqueOpens,
            clicks: acc.clicks + r.uniqueClicks,
            unsubscribes: acc.unsubscribes + r.unsubscribes,
        }),
        {
            campaigns: 0,
            recipients: 0,
            accepted: 0,
            failed: 0,
            bounced: 0,
            opens: 0,
            clicks: 0,
            unsubscribes: 0,
        }
    )

    /**
     * The export link, built without `window`.
     *
     * This runs during render, and render happens on the server too. The
     * first version read `window.location.origin` here, which threw
     * "window is not defined" on the server and made React throw the
     * server render away and start again in the browser. A relative URL
     * needs no origin.
     */
    const exportUrl = (() => {
        const query = new URLSearchParams({ format: "xlsx", limit: "100" })

        if (days > 0) {
            const from = new Date()
            from.setDate(from.getDate() - days)
            query.set("from", from.toISOString())
        }

        return `${API}?${query.toString()}`
    })()

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Reports
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Every campaign that has sent something, side by side.
                        Drafts are not here because they have no numbers.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setLoading(true)
                            load(days).finally(() => setLoading(false))
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                        <RefreshCw
                            size={14}
                            className={loading ? "animate-spin" : ""}
                        />
                        Refresh
                    </button>

                    {rows.length > 0 && (
                        <a
                            href={exportUrl}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                        >
                            <Download size={14} />
                            Export
                        </a>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                >
                    {WINDOWS.map((w) => (
                        <option key={w.days} value={w.days}>
                            {w.label}
                        </option>
                    ))}
                </select>

                <span className="text-xs text-slate-400 dark:text-neutral-500">
                    by date sent
                </span>
            </div>

            {loading ? (
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <BarChart3 size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        Nothing to report yet
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        A campaign appears here once it starts sending.
                    </p>
                    <Link
                        href="/admin/operations/email/campaigns"
                        className="mt-4 inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                        Go to campaigns
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat
                            label="Campaigns"
                            value={totals.campaigns.toLocaleString()}
                        />
                        <Stat
                            label="Accepted by the server"
                            value={totals.accepted.toLocaleString()}
                            hint={`of ${totals.recipients.toLocaleString()} recipients`}
                        />
                        <Stat
                            label="Unique opens"
                            value={totals.opens.toLocaleString()}
                            hint={
                                totals.accepted > 0
                                    ? `${pct(totals.opens, totals.accepted)} of accepted`
                                    : undefined
                            }
                        />
                        <Stat
                            label="Unique clicks"
                            value={totals.clicks.toLocaleString()}
                            hint={
                                totals.accepted > 0
                                    ? `${pct(totals.clicks, totals.accepted)} of accepted`
                                    : undefined
                            }
                        />
                    </div>

                    <PerformanceChart rows={sorted} />

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                        <table className="w-full min-w-[860px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
                                    <th className="px-3 py-2 font-medium">
                                        Campaign
                                    </th>
                                    <Th
                                        label="Sent"
                                        sortKey="sentAt"
                                        sort={sort}
                                        onSort={setSort}
                                    />
                                    <Th
                                        label="Recipients"
                                        sortKey="recipients"
                                        sort={sort}
                                        onSort={setSort}
                                    />
                                    <th className="px-3 py-2 font-medium">
                                        Accepted
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                        Failed
                                    </th>
                                    <Th
                                        label="Bounced"
                                        sortKey="bounceRate"
                                        sort={sort}
                                        onSort={setSort}
                                    />
                                    <Th
                                        label="Opened"
                                        sortKey="openRate"
                                        sort={sort}
                                        onSort={setSort}
                                    />
                                    <Th
                                        label="Clicked"
                                        sortKey="clickRate"
                                        sort={sort}
                                        onSort={setSort}
                                    />
                                    <th className="px-3 py-2 font-medium">
                                        Unsubscribed
                                    </th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                                {sorted.map((row) => {
                                    const meta =
                                        CAMPAIGN_STATUS_META[
                                            row.status as CampaignStatus
                                        ]

                                    return (
                                        <tr key={row.campaignId}>
                                            <td className="max-w-[220px] px-3 py-2">
                                                <Link
                                                    href={`/admin/operations/email/campaigns/${row.campaignId}`}
                                                    className="block truncate font-medium text-slate-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                                                >
                                                    {row.name}
                                                </Link>
                                                <span className="text-[10px] text-slate-400 dark:text-neutral-500">
                                                    {meta?.label ?? row.status}
                                                    {" · "}
                                                    {row.region}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 dark:text-neutral-400">
                                                {row.sentAt
                                                    ? new Date(
                                                          row.sentAt
                                                      ).toLocaleDateString()
                                                    : "—"}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums">
                                                {row.recipients.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-emerald-700 dark:text-emerald-400">
                                                {row.accepted.toLocaleString()}
                                            </td>
                                            <td
                                                className={clsx(
                                                    "px-3 py-2 tabular-nums",
                                                    row.failed > 0
                                                        ? "text-rose-600 dark:text-rose-400"
                                                        : "text-slate-400 dark:text-neutral-600"
                                                )}
                                            >
                                                {row.failed.toLocaleString()}
                                            </td>
                                            <Rate
                                                value={row.bounceRate}
                                                count={row.bounced}
                                            />
                                            <Rate
                                                value={row.openRate}
                                                count={row.uniqueOpens}
                                            />
                                            <Rate
                                                value={row.clickRate}
                                                count={row.uniqueClicks}
                                            />
                                            <td className="px-3 py-2 tabular-nums text-slate-500 dark:text-neutral-400">
                                                {row.unsubscribes.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <Link
                                                    href={`/admin/operations/email/campaigns/${row.campaignId}/report`}
                                                    className="whitespace-nowrap text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                                                >
                                                    Report
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-slate-400 dark:text-neutral-500">
                        Every rate here is a share of the mail the server
                        accepted, not of everybody targeted. Open figures are
                        approximate: privacy proxies fetch the tracking image
                        with nobody reading, and image blocking hides real
                        opens. Click figures are reliable.
                        {rows.some((r) => !r.deliveryConfirmed) &&
                            " Delivery confirmation is not reported by every provider, so a campaign can be accepted without a delivery figure."}
                    </p>

                    {truncated && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Only the most recent 100 campaigns are shown. Narrow
                            the date range to see older ones.
                        </p>
                    )}
                </>
            )}
        </div>
    )
}

function pct(part: number, whole: number): string {
    if (whole <= 0) return "—"
    return `${((part / whole) * 100).toFixed(1)}%`
}

/** A rate cell. An unmeasured rate is a dash, never nought per cent. */
function Rate({ value, count }: { value: number | null; count: number }) {
    return (
        <td className="whitespace-nowrap px-3 py-2">
            {value === null ? (
                <span className="text-slate-400 dark:text-neutral-600">—</span>
            ) : (
                <>
                    <span className="tabular-nums text-slate-900 dark:text-white">
                        {value}%
                    </span>
                    <span className="ml-1 text-[10px] text-slate-400 dark:text-neutral-500">
                        {count.toLocaleString()}
                    </span>
                </>
            )}
        </td>
    )
}

function Th({
    label,
    sortKey,
    sort,
    onSort,
}: {
    label: string
    sortKey: SortKey
    sort: SortKey
    onSort: (key: SortKey) => void
}) {
    return (
        <th className="px-3 py-2 font-medium">
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className={clsx(
                    "transition hover:text-slate-900 dark:hover:text-white",
                    sort === sortKey &&
                        "font-semibold text-slate-900 dark:text-white"
                )}
            >
                {label}
                {sort === sortKey && " ↓"}
            </button>
        </th>
    )
}

function Stat({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint?: string
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                {value}
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">
                {label}
            </div>
            {hint && (
                <div className="mt-0.5 text-[10px] text-slate-400 dark:text-neutral-500">
                    {hint}
                </div>
            )}
        </div>
    )
}
