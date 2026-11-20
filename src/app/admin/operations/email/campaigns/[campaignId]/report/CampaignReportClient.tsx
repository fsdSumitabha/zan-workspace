"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import { ArrowLeft, Download, RefreshCw } from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import {
    CAMPAIGN_STATUS_META,
    type CampaignStatus,
} from "@/constants/emailStatus"
import type { CampaignReport } from "@/lib/email/report/aggregate"

export default function CampaignReportClient({
    campaignId,
}: {
    campaignId: string
}) {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [report, setReport] = useState<CampaignReport | null>(null)
    const [settled, setSettled] = useState(false)

    const load = useCallback(async () => {
        const res = await fetch(
            `/api/admin/operations/email/campaigns/${campaignId}/report`,
            { credentials: "include", cache: "no-store" }
        )
        const json = await res.json().catch(() => null)

        if (handleAuthError(res, json, router, setForbidden)) return

        if (!res.ok || !json?.success) {
            throw new Error(json?.message || "Failed to load the report")
        }

        setReport(json.data.report as CampaignReport)
        setSettled(Boolean(json.data.settled))
    }, [campaignId, router])

    useEffect(() => {
        setLoading(true)
        load()
            .catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Failed to load")
            )
            .finally(() => setLoading(false))
    }, [load])

    if (forbidden) return <AccessDenied message={forbidden} />

    if (loading && !report) {
        return (
            <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        )
    }

    if (!report) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                That report could not be loaded.
            </div>
        )
    }

    const meta = CAMPAIGN_STATUS_META[report.status as CampaignStatus]
    const t = report.totals

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        href={`/admin/operations/email/campaigns/${campaignId}`}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-emerald-700 dark:text-neutral-400 dark:hover:text-emerald-400"
                    >
                        <ArrowLeft size={13} />
                        Back to the campaign
                    </Link>

                    <h1 className="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-white">
                        {report.name}
                    </h1>
                    <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-neutral-400">
                        {report.subject || "No subject"}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <span
                        className={clsx(
                            "rounded px-2 py-1 text-xs font-medium",
                            meta?.color ?? "bg-slate-500 text-white"
                        )}
                    >
                        {meta?.label ?? report.status}
                    </span>

                    <button
                        type="button"
                        onClick={() => {
                            setLoading(true)
                            load().finally(() => setLoading(false))
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                        <RefreshCw
                            size={14}
                            className={loading ? "animate-spin" : ""}
                        />
                        Refresh
                    </button>

                    <a
                        href={`/api/admin/operations/email/campaigns/${campaignId}/export`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                        <Download size={14} />
                        Export
                    </a>
                </div>
            </div>

            {/* A report of a running campaign is a snapshot. Saying so
                stops somebody circulating it as the final figure. */}
            {!settled && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                    This campaign has not finished, so these numbers are still
                    moving.
                </div>
            )}

            {/* ---- What went out ---- */}

            <Section title="What went out">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <Stat label="Recipients" value={t.recipients} />
                    <Stat
                        label="Accepted by the server"
                        value={t.accepted}
                        hint={`${report.rates.acceptedOfRecipients}% of recipients`}
                        tone="good"
                    />
                    <Stat
                        label="Confirmed delivered"
                        value={report.deliveryConfirmed ? t.delivered : null}
                        hint={
                            report.deliveryConfirmed
                                ? report.rates.deliveredOfAccepted !== null
                                    ? `${report.rates.deliveredOfAccepted}% of accepted`
                                    : undefined
                                : "this provider does not report it"
                        }
                        tone="good"
                    />
                    <Stat
                        label="Failed"
                        value={t.failed}
                        hint={`${report.rates.failedOfRecipients}% of recipients`}
                        tone={t.failed > 0 ? "bad" : undefined}
                    />
                    <Stat
                        label="Bounced"
                        value={t.bounced}
                        hint={
                            report.rates.bouncedOfAccepted !== null
                                ? `${report.rates.bouncedOfAccepted}% of accepted`
                                : undefined
                        }
                        tone={t.bounced > 0 ? "bad" : undefined}
                    />
                </div>

                {/* Accepted is not delivered. This is the single most
                    misread number in email reporting, so it is spelled
                    out on the screen rather than left to a tooltip. */}
                <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
                    Accepted means the mail server took the message. It is not
                    proof that it arrived.
                    {!report.deliveryConfirmed &&
                        " This provider sends no delivery confirmations, so there is no delivered figure to show."}
                </p>

                {(t.suppressed > 0 || t.cancelled > 0 || t.unknown > 0 || t.stillToSend > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {t.suppressed > 0 && (
                            <Pill
                                label="Suppressed"
                                value={t.suppressed}
                                note="unsubscribed, bounced before, or no consent"
                            />
                        )}
                        {t.cancelled > 0 && (
                            <Pill label="Cancelled" value={t.cancelled} />
                        )}
                        {t.unknown > 0 && (
                            <Pill
                                label="Outcome unknown"
                                value={t.unknown}
                                note="a worker stopped mid-send; we cannot say whether these went out"
                                tone="warn"
                            />
                        )}
                        {t.stillToSend > 0 && (
                            <Pill label="Still to send" value={t.stillToSend} />
                        )}
                    </div>
                )}
            </Section>

            {/* ---- What people did ---- */}

            <Section title="What people did">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Stat
                        label="Unique opens"
                        value={report.engagement.uniqueOpens}
                        hint={
                            report.rates.openedOfAccepted !== null
                                ? `${report.rates.openedOfAccepted}% of accepted`
                                : undefined
                        }
                    />
                    <Stat
                        label="Total opens"
                        value={report.engagement.totalOpens}
                    />
                    <Stat
                        label="Unique clicks"
                        value={report.engagement.uniqueClicks}
                        hint={
                            report.rates.clickedOfAccepted !== null
                                ? `${report.rates.clickedOfAccepted}% of accepted`
                                : undefined
                        }
                    />
                    <Stat
                        label="Total clicks"
                        value={report.engagement.totalClicks}
                    />
                    <Stat
                        label="Clicked after opening"
                        value={
                            report.rates.clickedOfOpened !== null
                                ? `${report.rates.clickedOfOpened}%`
                                : null
                        }
                        hint="of opens"
                    />
                    <Stat
                        label="Unsubscribed"
                        value={report.engagement.unsubscribes}
                        hint={
                            report.rates.unsubscribedOfAccepted !== null
                                ? `${report.rates.unsubscribedOfAccepted}% of accepted`
                                : undefined
                        }
                        tone={
                            report.rates.unsubscribedOfAccepted !== null &&
                            report.rates.unsubscribedOfAccepted > 2
                                ? "bad"
                                : undefined
                        }
                    />
                </div>

                <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
                    Open figures are approximate. Privacy proxies fetch the
                    tracking image with nobody reading, and image blocking
                    hides real opens. Click figures are reliable.
                </p>

                {report.engagement.complaints > 0 && (
                    <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                        {report.engagement.complaints} recipient
                        {report.engagement.complaints === 1 ? "" : "s"} marked
                        this as spam. That is worth looking at before the next
                        campaign: it affects whether later mail arrives at all.
                    </p>
                )}
            </Section>

            {/* ---- Links ---- */}

            {report.links.length > 0 && (
                <Section title="Which links were clicked">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
                                    <th className="py-2 pr-3 font-medium">
                                        Link
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                        Clicks
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                        People
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                                {report.links.map((link) => (
                                    <tr key={link.url}>
                                        <td className="max-w-[420px] truncate py-2 pr-3">
                                            <span
                                                title={link.url}
                                                className="text-slate-700 dark:text-neutral-200"
                                            >
                                                {link.url}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 tabular-nums text-slate-900 dark:text-white">
                                            {link.clicks.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 tabular-nums text-slate-500 dark:text-neutral-400">
                                            {link.uniqueClicks.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="mt-2 text-xs text-slate-400 dark:text-neutral-500">
                        &quot;Clicks&quot; counts every click. &quot;People&quot;
                        counts each recipient once, however many times they
                        clicked.
                    </p>
                </Section>
            )}

            {/* ---- Failures ---- */}

            {report.failures.length > 0 && (
                <Section title="Why sends failed">
                    <ul className="space-y-2">
                        {report.failures.map((failure) => (
                            <li
                                key={failure.errorClass}
                                className="flex flex-wrap items-baseline gap-2 text-sm"
                            >
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {failure.label}
                                </span>
                                <span className="tabular-nums text-rose-600 dark:text-rose-400">
                                    {failure.count.toLocaleString()}
                                </span>
                                {failure.example && (
                                    <span className="text-xs text-slate-500 dark:text-neutral-400">
                                        for example: {failure.example}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>

                    <Link
                        href={`/admin/operations/email/activity?campaign=${campaignId}`}
                        className="mt-3 inline-flex text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                        See every attempt and what the server replied
                    </Link>
                </Section>
            )}

            {/* ---- Timing ---- */}

            <Section title="How the send ran">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <Stat
                        label="Started"
                        value={
                            report.timing.startedAt
                                ? new Date(
                                      report.timing.startedAt
                                  ).toLocaleString()
                                : null
                        }
                        small
                    />
                    <Stat
                        label="Took"
                        value={
                            report.timing.durationMs
                                ? `${(report.timing.durationMs / 1000).toFixed(1)} s`
                                : null
                        }
                        small
                    />
                    <Stat
                        label="Throughput"
                        value={
                            report.timing.throughput
                                ? `${report.timing.throughput}/s`
                                : null
                        }
                        hint="accepted per second"
                        small
                    />
                    <Stat
                        label="p50 latency"
                        value={
                            report.latency.samples > 0
                                ? `${report.latency.p50} ms`
                                : null
                        }
                        small
                    />
                    <Stat
                        label="p95 latency"
                        value={
                            report.latency.samples > 0
                                ? `${report.latency.p95} ms`
                                : null
                        }
                        hint={
                            report.latency.samples > 0
                                ? `over ${report.latency.samples.toLocaleString()} attempts`
                                : undefined
                        }
                        small
                    />
                </div>
            </Section>
        </div>
    )
}

function Section({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                {title}
            </h2>
            {children}
        </section>
    )
}

/**
 * One figure.
 *
 * A null value shows an em dash, never a zero. The difference matters:
 * zero deliveries measured and no delivery measurement are different
 * facts, and showing both as "0" is the misreading this whole screen is
 * built to avoid.
 */
function Stat({
    label,
    value,
    hint,
    tone,
    small,
}: {
    label: string
    value: number | string | null
    hint?: string
    tone?: "good" | "bad"
    small?: boolean
}) {
    return (
        <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-neutral-800">
            <div
                className={clsx(
                    "font-semibold tabular-nums",
                    small ? "text-sm" : "text-lg",
                    value === null
                        ? "text-slate-300 dark:text-neutral-600"
                        : tone === "good"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : tone === "bad"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-slate-900 dark:text-white"
                )}
            >
                {value === null
                    ? "—"
                    : typeof value === "number"
                      ? value.toLocaleString()
                      : value}
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

function Pill({
    label,
    value,
    note,
    tone,
}: {
    label: string
    value: number
    note?: string
    tone?: "warn"
}) {
    return (
        <span
            title={note}
            className={clsx(
                "rounded-lg px-2 py-1",
                tone === "warn"
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                    : "bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300"
            )}
        >
            {label}: <span className="tabular-nums font-medium">{value}</span>
        </span>
    )
}
