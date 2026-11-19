"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import {
    AlertTriangle,
    ArrowLeft,
    BarChart3,
    Clock,
    HelpCircle,
    Loader2,
    RefreshCw,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUS_META,
    RECIPIENT_STATUS,
    RECIPIENT_STATUS_META,
    type CampaignStatus,
    type RecipientStatus,
} from "@/constants/emailStatus"
import type { CampaignDetailResponse } from "@/types/email"

const API = "/api/admin/operations/email/campaigns"

type Tab = "overview" | "recipients"

/** Actions, keyed by the status they move the campaign to. */
const ACTIONS: Partial<
    Record<CampaignStatus, { label: string; action: string; danger?: boolean }>
> = {
    [CAMPAIGN_STATUS.QUEUEING]: { label: "Send now", action: "send-now" },
    [CAMPAIGN_STATUS.DRAFT]: { label: "Back to draft", action: "unschedule" },
    [CAMPAIGN_STATUS.PAUSED]: { label: "Pause", action: "pause" },
    [CAMPAIGN_STATUS.SENDING]: { label: "Resume", action: "resume" },
    [CAMPAIGN_STATUS.CANCELLED]: { label: "Cancel", action: "cancel", danger: true },
    [CAMPAIGN_STATUS.ARCHIVED]: { label: "Archive", action: "archive" },
}

export default function CampaignDetailClient({
    campaignId,
}: {
    campaignId: string
}) {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [data, setData] = useState<CampaignDetailResponse | null>(null)
    const [tab, setTab] = useState<Tab>("overview")
    const [statusFilter, setStatusFilter] = useState<RecipientStatus | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(
        async (filter: RecipientStatus | null) => {
            const url = new URL(`${API}/${campaignId}`, window.location.origin)
            if (filter !== null) {
                url.searchParams.set("recipientStatus", String(filter))
            }

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not load the campaign")
            }

            setData(json.data as CampaignDetailResponse)
        },
        [campaignId, router]
    )

    useEffect(() => {
        load(statusFilter)
            .catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Could not load")
            )
            .finally(() => setLoading(false))
    }, [load, statusFilter])

    /**
     * While a campaign is sending, the numbers move. Poll gently rather
     * than making somebody press refresh, and stop as soon as it settles
     * so a finished campaign does not keep querying for ever.
     */
    const sending =
        data?.campaign.status === CAMPAIGN_STATUS.SENDING ||
        data?.campaign.status === CAMPAIGN_STATUS.QUEUEING

    useEffect(() => {
        if (!sending) return

        const timer = setInterval(() => {
            load(statusFilter).catch(() => {
                // A failed poll is not worth a toast; the next one retries.
            })
        }, 5_000)

        return () => clearInterval(timer)
    }, [sending, load, statusFilter])

    async function act(action: string) {
        const campaign = data?.campaign
        if (!campaign) return

        if (action === "cancel") {
            const unsent =
                campaign.counts.total -
                campaign.counts.submitted -
                campaign.counts.failed
            if (
                !window.confirm(
                    `Cancel "${campaign.name}"? ` +
                    (unsent > 0
                        ? `${unsent} recipient${unsent === 1 ? "" : "s"} will not be sent to. `
                        : "") +
                    "This cannot be undone."
                )
            ) {
                return
            }
        }

        if (action === "send-now") {
            if (
                !window.confirm(
                    `Send "${campaign.name}" now? This emails real people.`
                )
            ) {
                return
            }
        }

        setBusy(true)
        try {
            const res = await fetch(`${API}/${campaignId}/action`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "That did not work")
            }

            toast.success(json.data?.message ?? "Done.")
            await load(statusFilter)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "That did not work")
        } finally {
            setBusy(false)
        }
    }

    if (forbidden) return <AccessDenied message={forbidden} />

    if (loading || !data) {
        return (
            <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        )
    }

    const { campaign, recipients, recipientCounts } = data
    const meta = CAMPAIGN_STATUS_META[campaign.status as CampaignStatus]

    const actions = campaign.allowedActions
        .map((status) => ACTIONS[status as CampaignStatus])
        .filter(Boolean) as Array<{ label: string; action: string; danger?: boolean }>

    /**
     * A campaign that has not built its recipient snapshot yet.
     *
     * Its `counts.total` is the figure somebody approved in the wizard, but
     * no CampaignRecipient rows exist until the dispatcher starts it.
     */
    const notStartedYet =
        campaign.status === CAMPAIGN_STATUS.DRAFT ||
        campaign.status === CAMPAIGN_STATUS.SCHEDULED

    return (
        <div className="space-y-4">
            {/* ---------- Header ---------- */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        href="/admin/operations/email/campaigns"
                        className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white"
                    >
                        <ArrowLeft size={13} />
                        Campaigns
                    </Link>
                    <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                        {campaign.name}
                    </h1>
                    <p className="truncate text-sm text-slate-500 dark:text-neutral-400">
                        {campaign.subject || "No subject"}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={clsx(
                            "rounded-md px-2 py-1 text-xs font-medium",
                            meta?.color ?? "bg-slate-500 text-white"
                        )}
                    >
                        {meta?.label}
                    </span>

                    {sending && (
                        <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400">
                            <RefreshCw size={12} className="animate-spin" />
                            live
                        </span>
                    )}

                    {/* Only once there is something to report. A report of
                        a draft is an empty page with a heading. */}
                    {!notStartedYet && (
                        <Link
                            href={`/admin/operations/email/campaigns/${campaignId}/report`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                            <BarChart3 size={14} />
                            Report
                        </Link>
                    )}

                    {actions.map((item) => (
                        <button
                            key={item.action}
                            type="button"
                            disabled={busy}
                            onClick={() => act(item.action)}
                            className={clsx(
                                "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
                                item.danger
                                    ? "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                    : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            )}
                        >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : item.label}
                        </button>
                    ))}
                </div>
            </div>

            {campaign.status === CAMPAIGN_STATUS.HALTED && (
                <Banner tone="danger" title="This campaign was stopped">
                    {campaign.haltedReason ||
                        "The safety system stopped it. Check Settings."}
                </Banner>
            )}

            {campaign.status === CAMPAIGN_STATUS.FAILED && (
                <Banner tone="danger" title="This campaign could not start">
                    {campaign.failureReason || "Nothing was sent."}
                </Banner>
            )}

            {campaign.status === CAMPAIGN_STATUS.SCHEDULED && campaign.scheduleWall && (
                <Banner tone="info" title="Scheduled" icon={<Clock size={15} />}>
                    {campaign.scheduleWall.replace("T", " ")} {campaign.scheduleZone}
                </Banner>
            )}

            {/* ---------- Tabs ---------- */}
            <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                {(
                    [
                        { id: "overview", label: "Overview" },
                        {
                            id: "recipients",
                            label: `Recipients (${campaign.counts.total})`,
                        },
                    ] as const
                ).map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id as Tab)}
                        className={clsx(
                            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                            tab === item.id
                                ? "bg-emerald-600 text-white"
                                : "text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                        )}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {/* ---------- Overview ---------- */}
            {tab === "overview" && (
                <div className="space-y-4">
                    {campaign.counts.total > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                            <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400">
                                <span>Progress</span>
                                <span className="tabular-nums">
                                    {campaign.progress}%
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all"
                                    style={{ width: `${campaign.progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Submitted and Delivered are never added together. */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        <Tile label="Recipients" value={campaign.counts.total} />
                        <Tile
                            label="Accepted by server"
                            value={campaign.counts.submitted}
                            tone="good"
                            hint="The mail server took the message. It does not mean it arrived."
                        />
                        <Tile
                            label="Confirmed delivered"
                            value={campaign.counts.delivered}
                            hint="Only a provider that sends webhooks can confirm this."
                            muted={campaign.counts.delivered === 0}
                        />
                        <Tile
                            label="Failed"
                            value={campaign.counts.failed}
                            tone={campaign.counts.failed > 0 ? "bad" : undefined}
                        />
                        <Tile
                            label="Unknown"
                            value={campaign.counts.unknown}
                            tone={campaign.counts.unknown > 0 ? "warn" : undefined}
                            hint="A worker stopped mid-send. We cannot say whether these went out, so they were not sent again."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Tile label="Suppressed" value={campaign.counts.suppressed} />
                        <Tile label="Cancelled" value={campaign.counts.cancelled} />
                        <Tile
                            label="Unique opens"
                            value={campaign.engagement.uniqueOpens}
                            hint="Approximate. Privacy proxies inflate opens and image blocking hides them."
                        />
                        <Tile
                            label="Unique clicks"
                            value={campaign.engagement.uniqueClicks}
                            hint="Reliable, unlike opens."
                        />
                    </div>

                    {campaign.counts.delivered === 0 &&
                        campaign.counts.submitted > 0 && (
                            <p className="flex items-start gap-1.5 rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                                <HelpCircle size={13} className="mt-0.5 shrink-0" />
                                Confirmed delivered is zero because this provider
                                does not report deliveries. It is not a sign that
                                anything failed.
                            </p>
                        )}
                </div>
            )}

            {/* ---------- Recipients ---------- */}
            {tab === "recipients" && (
                <div className="space-y-3">
                    {/* Plain flex. See the note in WizardSteps.tsx: the
                        `w-0 min-w-full sm:min-w-0` pattern collapses when
                        nothing stretches the element back out. */}
                    <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                        {/* The real number of rows, not the campaign's
                            counts.total. Before a campaign starts, the
                            total is the approved estimate and no recipient
                            rows exist yet; showing it here would label an
                            empty table "21". */}
                        <Chip
                            active={statusFilter === null}
                            label="All"
                            count={Object.values(recipientCounts).reduce(
                                (a, b) => a + b,
                                0
                            )}
                            onClick={() => setStatusFilter(null)}
                        />
                        {(
                            [
                                RECIPIENT_STATUS.SUBMITTED,
                                RECIPIENT_STATUS.DELIVERED,
                                RECIPIENT_STATUS.FAILED,
                                RECIPIENT_STATUS.BOUNCED,
                                RECIPIENT_STATUS.RETRYING,
                                RECIPIENT_STATUS.SUPPRESSED,
                                RECIPIENT_STATUS.UNKNOWN_OUTCOME,
                                RECIPIENT_STATUS.QUEUED,
                            ] as RecipientStatus[]
                        )
                            .filter((s) => (recipientCounts[String(s)] ?? 0) > 0)
                            .map((status) => (
                                <Chip
                                    key={status}
                                    active={statusFilter === status}
                                    label={RECIPIENT_STATUS_META[status].label}
                                    count={recipientCounts[String(status)]}
                                    onClick={() => setStatusFilter(status)}
                                />
                            ))}
                    </div>

                    {recipients.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                            {/* Which message depends on whether the campaign
                                has started, not on counts.total. A scheduled
                                campaign has an approved total but no rows
                                yet, and telling somebody "nothing matches
                                that filter" there is simply wrong. */}
                            {notStartedYet
                                ? "The recipients are worked out when the campaign starts, so that editing a lead in the meantime cannot change who it reaches."
                                : statusFilter !== null
                                  ? "Nothing matches that filter."
                                  : "No recipients."}
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
                                        <th className="px-4 py-2 font-medium">Email</th>
                                        <th className="px-4 py-2 font-medium">Status</th>
                                        <th className="hidden px-4 py-2 font-medium sm:table-cell">
                                            Tries
                                        </th>
                                        <th className="hidden px-4 py-2 font-medium md:table-cell">
                                            Detail
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                                    {recipients.map((row) => {
                                        const rm =
                                            RECIPIENT_STATUS_META[
                                                row.status as RecipientStatus
                                            ]

                                        return (
                                            <tr key={row._id}>
                                                <td className="max-w-[200px] px-4 py-2">
                                                    <div className="truncate text-slate-900 dark:text-white">
                                                        {row.email}
                                                    </div>
                                                    {row.name && (
                                                        <div className="truncate text-xs text-slate-500 dark:text-neutral-500">
                                                            {row.name}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span
                                                        className={clsx(
                                                            "rounded px-1.5 py-0.5 text-xs font-medium",
                                                            rm?.color ??
                                                                "bg-slate-500 text-white"
                                                        )}
                                                    >
                                                        {rm?.label}
                                                    </span>
                                                </td>
                                                <td className="hidden px-4 py-2 tabular-nums text-slate-500 sm:table-cell dark:text-neutral-400">
                                                    {row.attempts}
                                                </td>
                                                <td className="hidden max-w-[280px] px-4 py-2 md:table-cell">
                                                    {row.lastError ? (
                                                        <span
                                                            title={row.lastError}
                                                            className="line-clamp-2 text-xs text-rose-600 dark:text-rose-400"
                                                        >
                                                            {row.lastSmtpCode
                                                                ? `${row.lastSmtpCode} · `
                                                                : ""}
                                                            {row.lastError}
                                                        </span>
                                                    ) : row.submittedAt ? (
                                                        <span className="text-xs text-slate-500 dark:text-neutral-500">
                                                            {new Date(
                                                                row.submittedAt
                                                            ).toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">
                                                            —
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */

function Tile({
    label,
    value,
    tone,
    hint,
    muted,
}: {
    label: string
    value: number
    tone?: "good" | "bad" | "warn"
    hint?: string
    muted?: boolean
}) {
    return (
        <div
            title={hint}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
            <div
                className={clsx(
                    "text-xl font-semibold",
                    muted
                        ? "text-slate-300 dark:text-neutral-700"
                        : tone === "good"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : tone === "bad"
                            ? "text-rose-600 dark:text-rose-400"
                            : tone === "warn"
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-slate-900 dark:text-white"
                )}
            >
                {muted ? "—" : value.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400">
                {label}
                {hint && <HelpCircle size={10} className="shrink-0 opacity-50" />}
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

function Banner({
    tone,
    title,
    icon,
    children,
}: {
    tone: "danger" | "info"
    title: string
    icon?: React.ReactNode
    children: React.ReactNode
}) {
    const classes =
        tone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
            : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200"

    return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${classes}`}>
            <div className="flex items-center gap-2 font-medium">
                {icon ?? <AlertTriangle size={15} />}
                {title}
            </div>
            <div className="mt-1 text-xs opacity-90">{children}</div>
        </div>
    )
}
