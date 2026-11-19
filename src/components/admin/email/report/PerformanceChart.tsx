"use client"

import { useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import clsx from "clsx"

/**
 * Campaigns side by side.
 *
 * Two views, because they answer different questions and mixing them on
 * one axis is how a chart lies. "Delivery" is counts of mail: did it go
 * out. "Engagement" is rates: did anybody read it. A count and a
 * percentage share no scale, so they never share an axis here.
 *
 * Colours come from CSS variables set with Tailwind's dark: variant
 * rather than from reading the theme in JavaScript. Reading the DOM for a
 * theme gives the wrong answer on the first render and the chart flickers.
 */

export interface ChartRow {
    campaignId: string
    name: string
    recipients: number
    accepted: number
    failed: number
    bounced: number
    uniqueOpens: number
    uniqueClicks: number
    openRate: number | null
    clickRate: number | null
    bounceRate: number | null
}

type View = "delivery" | "engagement"

const DELIVERY_SERIES = [
    { key: "accepted", label: "Accepted", color: "#059669" },
    { key: "failed", label: "Failed", color: "#e11d48" },
    { key: "bounced", label: "Bounced", color: "#b91c1c" },
] as const

const ENGAGEMENT_SERIES = [
    { key: "openRate", label: "Open rate", color: "#2563eb" },
    { key: "clickRate", label: "Click rate", color: "#7c3aed" },
] as const

export default function PerformanceChart({ rows }: { rows: ChartRow[] }) {
    const [view, setView] = useState<View>("delivery")

    if (rows.length === 0) return null

    // Oldest on the left, so the chart reads as time passing.
    const data = rows
        .slice()
        .reverse()
        .map((row) => ({
            ...row,
            short: row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name,
        }))

    const series = view === "delivery" ? DELIVERY_SERIES : ENGAGEMENT_SERIES

    /**
     * Whether any campaign has an engagement figure at all.
     *
     * A rate is null when nothing was accepted, so there is no base to
     * divide by. An all-null chart would draw an empty grid, which looks
     * like a bug rather than like an absence.
     */
    const hasRates = rows.some(
        (r) => r.openRate !== null || r.clickRate !== null
    )

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {view === "delivery"
                            ? "What went out"
                            : "What people did"}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">
                        {view === "delivery"
                            ? "Counts of mail per campaign."
                            : "A share of the mail the server accepted, not of everybody targeted."}
                    </p>
                </div>

                <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-neutral-800">
                    <Toggle
                        active={view === "delivery"}
                        label="Delivery"
                        onClick={() => setView("delivery")}
                    />
                    <Toggle
                        active={view === "engagement"}
                        label="Engagement"
                        onClick={() => setView("engagement")}
                    />
                </div>
            </div>

            {view === "engagement" && !hasRates ? (
                <div className="flex h-56 items-center justify-center text-center text-sm text-slate-500 dark:text-neutral-400">
                    No campaign here has sent anything yet, so there is no
                    rate to show.
                </div>
            ) : (
                <div
                    className="h-72 w-full [--axis:#64748b] [--grid:#e2e8f0] dark:[--axis:#a3a3a3] dark:[--grid:#262626]"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                        >
                            <CartesianGrid
                                stroke="var(--grid)"
                                strokeDasharray="3 3"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="short"
                                stroke="var(--axis)"
                                tick={{ fontSize: 11 }}
                                interval={0}
                                angle={data.length > 6 ? -25 : 0}
                                textAnchor={data.length > 6 ? "end" : "middle"}
                                height={data.length > 6 ? 56 : 28}
                            />
                            <YAxis
                                stroke="var(--axis)"
                                tick={{ fontSize: 11 }}
                                width={46}
                                allowDecimals={false}
                                domain={
                                    view === "engagement" ? [0, 100] : undefined
                                }
                                tickFormatter={(v: number) =>
                                    view === "engagement" ? `${v}%` : String(v)
                                }
                            />
                            <Tooltip
                                content={<ReportTooltip view={view} />}
                                cursor={{ fill: "var(--grid)", opacity: 0.4 }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: 11 }}
                                iconType="circle"
                                iconSize={8}
                            />

                            {series.map((s) => (
                                <Bar
                                    key={s.key}
                                    dataKey={s.key}
                                    name={s.label}
                                    fill={s.color}
                                    radius={[3, 3, 0, 0]}
                                    maxBarSize={38}
                                    stackId={
                                        view === "delivery" ? "mail" : undefined
                                    }
                                >
                                    {/* Explicit cells, so a null rate draws
                                        nothing rather than a zero-height bar
                                        that reads as a measured zero. */}
                                    {data.map((row) => (
                                        <Cell
                                            key={row.campaignId}
                                            fill={s.color}
                                            fillOpacity={
                                                row[
                                                    s.key as keyof typeof row
                                                ] === null
                                                    ? 0
                                                    : 1
                                            }
                                        />
                                    ))}
                                </Bar>
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}

/**
 * The tooltip names the base of every rate it shows.
 *
 * The default recharts tooltip would print "Open rate: 43.6", which is the
 * figure without the thing it is a share of.
 */
function ReportTooltip({
    view,
    active,
    payload,
}: {
    view: View
    active?: boolean
    payload?: Array<{ name?: string; value?: number | string; payload?: ChartRow }>
}) {
    if (!active || !payload?.length) return null

    const row = payload[0]?.payload
    if (!row) return null

    return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <div className="font-medium text-slate-900 dark:text-white">
                {row.name}
            </div>

            {view === "delivery" ? (
                <dl className="mt-1.5 space-y-0.5 text-slate-600 dark:text-neutral-300">
                    <Line label="Recipients" value={row.recipients} />
                    <Line label="Accepted" value={row.accepted} />
                    <Line label="Failed" value={row.failed} />
                    <Line label="Bounced" value={row.bounced} />
                </dl>
            ) : (
                <dl className="mt-1.5 space-y-0.5 text-slate-600 dark:text-neutral-300">
                    <Line
                        label="Opened"
                        value={
                            row.openRate === null
                                ? "not measured"
                                : `${row.openRate}% of ${row.accepted} accepted`
                        }
                    />
                    <Line
                        label="Clicked"
                        value={
                            row.clickRate === null
                                ? "not measured"
                                : `${row.clickRate}% of ${row.accepted} accepted`
                        }
                    />
                    <Line label="Unique opens" value={row.uniqueOpens} />
                    <Line label="Unique clicks" value={row.uniqueClicks} />
                </dl>
            )}
        </div>
    )
}

function Line({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="flex justify-between gap-4">
            <dt>{label}</dt>
            <dd className="tabular-nums font-medium text-slate-900 dark:text-white">
                {typeof value === "number" ? value.toLocaleString() : value}
            </dd>
        </div>
    )
}

function Toggle({
    active,
    label,
    onClick,
}: {
    active: boolean
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                active
                    ? "bg-white text-slate-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
            )}
        >
            {label}
        </button>
    )
}
