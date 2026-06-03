"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    type ChartData,
    type ChartOptions,
} from "chart.js"
import { Pie, Doughnut } from "react-chartjs-2"
import {
    TrendingUp,
    Wallet,
    CalendarClock,
    Users as UsersIcon,
} from "lucide-react"

import TimeAgo from "./dayjs/TimeAgo"

ChartJS.register(ArcElement, Tooltip)

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface OverallStats {
    leads: {
        total: number
        byStatus: Record<string, number>
        active: number
        converted: number
        lost: number
        conversionRate: number
    }
    clients: {
        total: number
        byStatus: {
            active: number
            inactive: number
            onHold: number
            completed: number
        }
    }
    projects: {
        total: number
        byStatus: Record<string, number>
        pipeline: number
        running: number
        closed: number
        totalBudgetRunning: number
    }
    meetings: {
        total: number
        byStatus: Record<string, number>
        today: number
        thisWeek: number
        upcoming: number
    }
    users: {
        total: number
        active: number
        inactive: number
        byRole: Record<string, number>
    }
    updatedAt: string
}

interface ApiResponse {
    success: boolean
    data?: OverallStats
    message?: string
}

interface StatusMeta {
    label: string
    color: string
}

/* ------------------------------------------------------------------ */
/* Status palettes                                                     */
/* ------------------------------------------------------------------ */

const LEAD_STATUS_META: Record<string, StatusMeta> = {
    new: { label: "New", color: "#94a3b8" },
    contacted: { label: "Contacted", color: "#3b82f6" },
    meeting: { label: "Meeting", color: "#8b5cf6" },
    discussion: { label: "Discussion", color: "#eab308" },
    negotiation: { label: "Negotiation", color: "#f97316" },
    converted: { label: "Converted", color: "#10b981" },
    lost: { label: "Lost", color: "#ef4444" },
}

const CLIENT_STATUS_META: Record<string, StatusMeta> = {
    active: { label: "Active", color: "#10b981" },
    inactive: { label: "Inactive", color: "#94a3b8" },
    onHold: { label: "On Hold", color: "#f59e0b" },
    completed: { label: "Completed", color: "#3b82f6" },
}

const PROJECT_STATUS_META: Record<string, StatusMeta> = {
    discussion: { label: "Discussion", color: "#3b82f6" },
    proposalSent: { label: "Proposal", color: "#6366f1" },
    negotiation: { label: "Negotiation", color: "#a855f7" },
    confirmed: { label: "Confirmed", color: "#10b981" },
    inProgress: { label: "In Progress", color: "#f59e0b" },
    deployed: { label: "Deployed", color: "#06b6d4" },
    maintenance: { label: "Maintenance", color: "#ec4899" },
    closed: { label: "Closed", color: "#737373" },
}

const MEETING_STATUS_META: Record<string, StatusMeta> = {
    scheduled: { label: "Scheduled", color: "#3b82f6" },
    rescheduled: { label: "Rescheduled", color: "#f59e0b" },
    cancelled: { label: "Cancelled", color: "#ef4444" },
    missed: { label: "Missed", color: "#94a3b8" },
    completed: { label: "Completed", color: "#10b981" },
}

const INR_COMPACT = (n: number): string => {
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`
    if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`
    return `₹${n}`
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function OverallStatsPanel() {
    const [data, setData] = useState<OverallStats | null>(null)
    const [loading, setLoading] = useState(true)
    const pathname = usePathname()

    useEffect(() => {
        let cancelled = false
        fetch("/api/admin/operations/overall-stats", {
            credentials: "include",
            cache: "no-store",
        })
            .then((r) => r.json() as Promise<ApiResponse>)
            .then((json) => {
                if (cancelled) return
                if (json.success && json.data) setData(json.data)
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [pathname])

    if (loading && !data) return <FullPageSkeleton />
    if (!data) return null

    const conversionPct = Math.round(data.leads.conversionRate * 100)

    return (
        <div className="space-y-6">
            {/* Freshness indicator */}
            <div className="flex items-center justify-end text-[11px] text-neutral-500 dark:text-neutral-400">
                Updated <TimeAgo date={data.updatedAt} />
            </div>

            {/* KPI hero row — the singular headline numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                    icon={<TrendingUp className="w-4 h-4" />}
                    tone="emerald"
                    label="Conversion"
                    value={`${conversionPct}%`}
                    subtitle={`${data.leads.converted} of ${data.leads.total} leads`}
                />
                <KpiCard
                    icon={<Wallet className="w-4 h-4" />}
                    tone="amber"
                    label="Active budget"
                    value={INR_COMPACT(data.projects.totalBudgetRunning)}
                    subtitle={`${data.projects.running} projects running`}
                />
                <KpiCard
                    icon={<CalendarClock className="w-4 h-4" />}
                    tone="blue"
                    label="Upcoming"
                    value={String(data.meetings.upcoming)}
                    subtitle={`${data.meetings.thisWeek} this week · ${data.meetings.today} today`}
                />
                <KpiCard
                    icon={<UsersIcon className="w-4 h-4" />}
                    tone="rose"
                    label="Active team"
                    value={String(data.users.active)}
                    subtitle={`${data.users.total} total${
                        data.users.inactive > 0
                            ? ` · ${data.users.inactive} inactive`
                            : ""
                    }`}
                />
            </div>

            {/* 2 × 2 grid of full-size pie cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EntityPieCard
                    label="Leads"
                    link="/admin/operations/leads"
                    total={data.leads.total}
                    accent="89% converted"
                    accentTone="emerald"
                    byStatus={data.leads.byStatus}
                    meta={LEAD_STATUS_META}
                    chartType="doughnut"
                    centerLine1={`${conversionPct}%`}
                    centerLine2="conversion"
                />
                <EntityPieCard
                    label="Clients"
                    link="/admin/operations/clients"
                    total={data.clients.total}
                    byStatus={data.clients.byStatus}
                    meta={CLIENT_STATUS_META}
                    chartType="pie"
                />
                <EntityPieCard
                    label="Projects"
                    link="/admin/operations/projects"
                    total={data.projects.total}
                    accent={INR_COMPACT(data.projects.totalBudgetRunning)}
                    accentTone="amber"
                    byStatus={data.projects.byStatus}
                    meta={PROJECT_STATUS_META}
                    chartType="pie"
                />
                <EntityPieCard
                    label="Meetings"
                    link="/admin/operations/meetings"
                    total={data.meetings.total}
                    accent={`${data.meetings.upcoming} upcoming`}
                    accentTone="blue"
                    byStatus={data.meetings.byStatus}
                    meta={MEETING_STATUS_META}
                    chartType="pie"
                />
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* KPI hero card                                                       */
/* ------------------------------------------------------------------ */

const TONE: Record<
    string,
    { icon: string; accentText: string }
> = {
    emerald: {
        icon: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        accentText: "text-emerald-600 dark:text-emerald-400",
    },
    amber: {
        icon: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
        accentText: "text-amber-600 dark:text-amber-400",
    },
    blue: {
        icon: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
        accentText: "text-blue-600 dark:text-blue-400",
    },
    rose: {
        icon: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
        accentText: "text-rose-600 dark:text-rose-400",
    },
    purple: {
        icon: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
        accentText: "text-purple-600 dark:text-purple-400",
    },
}

function KpiCard({
    icon,
    tone,
    label,
    value,
    subtitle,
}: {
    icon: React.ReactNode
    tone: keyof typeof TONE
    label: string
    value: string
    subtitle: string
}) {
    return (
        <div className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center ${TONE[tone].icon}`}
                >
                    {icon}
                </div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">
                    {label}
                </span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white leading-none">
                {value}
            </div>
            <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {subtitle}
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Entity pie card                                                     */
/* ------------------------------------------------------------------ */

function EntityPieCard({
    label,
    total,
    accent,
    accentTone,
    byStatus,
    meta,
    chartType,
    centerLine1,
    centerLine2,
    link,
}: {
    label: string
    total: number
    accent?: string
    accentTone?: keyof typeof TONE
    byStatus: Record<string, number>
    meta: Record<string, StatusMeta>
    chartType: "pie" | "doughnut"
    centerLine1?: string
    centerLine2?: string
    link?: string
}) {
    const entries = Object.entries(byStatus).filter(([, v]) => v > 0)

    if (entries.length === 0) {
        return (
            <div className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
                <CardHeader
                    label={label}
                    link={link}
                    total={total}
                    accent={accent}
                    accentTone={accentTone}
                />
                <div className="mt-6 flex items-center justify-center h-40 text-sm text-neutral-500">
                    No activity yet
                </div>
            </div>
        )
    }

    const chartData: ChartData<"pie" | "doughnut"> = {
        labels: entries.map(([k]) => meta[k]?.label ?? k),
        datasets: [
            {
                data: entries.map(([, v]) => v),
                backgroundColor: entries.map(
                    ([k]) => meta[k]?.color ?? "#737373"
                ),
                borderWidth: 0,
            },
        ],
    }

    const chartOptions: ChartOptions<"pie" | "doughnut"> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: chartType === "doughnut" ? "65%" : undefined,
        plugins: {
            legend: { display: false },
            tooltip: {
                displayColors: true,
                padding: 10,
                titleFont: { size: 12 },
                bodyFont: { size: 12 },
                callbacks: {
                    label: (ctx) => {
                        const value = Number(ctx.parsed)
                        const pct =
                            total > 0
                                ? Math.round((value / total) * 100)
                                : 0
                        return `${ctx.label}: ${value} (${pct}%)`
                    },
                },
            },
        },
    }

    return (
        <div className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
            <CardHeader
                label={label}
                link={link}
                total={total}
                accent={accent}
                accentTone={accentTone}
            />

            <div className="mt-5 grid grid-cols-5 gap-4 items-center">
                {/* Chart */}
                <div className="col-span-2 relative h-40 flex items-center justify-center">
                    {chartType === "doughnut" ? (
                        <Doughnut
                            data={chartData as ChartData<"doughnut">}
                            options={chartOptions as ChartOptions<"doughnut">}
                        />
                    ) : (
                        <Pie
                            data={chartData as ChartData<"pie">}
                            options={chartOptions as ChartOptions<"pie">}
                        />
                    )}
                    {chartType === "doughnut" && (centerLine1 || centerLine2) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            {centerLine1 && (
                                <span className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white leading-none">
                                    {centerLine1}
                                </span>
                            )}
                            {centerLine2 && (
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                                    {centerLine2}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Legend */}
                <div className="col-span-3 space-y-1.5">
                    {entries.map(([k, v]) => {
                        const pct =
                            total > 0
                                ? Math.round((v / total) * 100)
                                : 0
                        return (
                            <div
                                key={k}
                                className="flex items-center gap-2 text-xs"
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                                    style={{
                                        backgroundColor:
                                            meta[k]?.color ?? "#737373",
                                    }}
                                />
                                <span className="text-neutral-700 dark:text-neutral-300 flex-1 truncate">
                                    {meta[k]?.label ?? k}
                                </span>
                                <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
                                    {v}
                                </span>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 w-9 text-right tabular-nums">
                                    {pct}%
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function CardHeader({
    label,
    total,
    accent,
    accentTone,
    link,
}: {
    label: string
    total: number
    accent?: string
    accentTone?: keyof typeof TONE
    link?: string
}) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
                {link ? (
                    <Link
                        href={link}
                        className="text-base font-semibold text-neutral-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition"
                    >
                        {label}
                    </Link>
                ) : (
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                        {label}
                    </h3>
                )}
                <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {total}
                </span>
            </div>
            {accent && (
                <span
                    className={`text-xs font-semibold tabular-nums ${
                        accentTone ? TONE[accentTone].accentText : ""
                    }`}
                >
                    {accent}
                </span>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function FullPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-24 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
                    />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-64 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
                    />
                ))}
            </div>
        </div>
    )
}
