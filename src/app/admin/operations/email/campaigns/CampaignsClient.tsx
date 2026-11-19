"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import { Mails, Plus, Search } from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import CampaignRow from "@/components/admin/email/campaign/CampaignRow"
import {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUS_META,
    type CampaignStatus,
} from "@/constants/emailStatus"
import type { EmailCampaignRow } from "@/types/email"

const API = "/api/admin/operations/email/campaigns"

/** The tabs, and which statuses each one holds. */
const TABS: Array<{
    id: string
    label: string
    statuses: CampaignStatus[] | null
}> = [
    { id: "all", label: "All", statuses: null },
    { id: "draft", label: "Draft", statuses: [CAMPAIGN_STATUS.DRAFT] },
    { id: "scheduled", label: "Scheduled", statuses: [CAMPAIGN_STATUS.SCHEDULED] },
    {
        id: "sending",
        label: "Sending",
        statuses: [
            CAMPAIGN_STATUS.QUEUEING,
            CAMPAIGN_STATUS.SENDING,
            CAMPAIGN_STATUS.PAUSED,
            CAMPAIGN_STATUS.HALTED,
        ],
    },
    {
        id: "done",
        label: "Completed",
        statuses: [
            CAMPAIGN_STATUS.COMPLETED,
            CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES,
        ],
    },
    {
        id: "failed",
        label: "Failed",
        statuses: [CAMPAIGN_STATUS.FAILED, CAMPAIGN_STATUS.CANCELLED],
    },
    { id: "archived", label: "Archived", statuses: [CAMPAIGN_STATUS.ARCHIVED] },
]

export default function CampaignsClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<EmailCampaignRow[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [tab, setTab] = useState("all")
    const [search, setSearch] = useState("")
    const [busyId, setBusyId] = useState<string | null>(null)
    const [precision, setPrecision] = useState<number | null>(null)

    const load = useCallback(
        async (tabId: string, q: string) => {
            const chosen = TABS.find((t) => t.id === tabId)

            const url = new URL(API, window.location.origin)
            if (q) url.searchParams.set("search", q)
            // The API takes one status. For a tab that covers several, the
            // filter is applied here instead and the tab counts come from
            // the per-status counts the API returns anyway.
            if (chosen?.statuses?.length === 1) {
                url.searchParams.set("status", String(chosen.statuses[0]))
            }
            url.searchParams.set("limit", "100")

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to load the campaigns")
            }

            const all = json.data as EmailCampaignRow[]
            const statuses = chosen?.statuses

            setRows(
                statuses && statuses.length > 1
                    ? all.filter((c) => statuses.includes(c.status as CampaignStatus))
                    : all
            )
            setCounts(json.counts ?? {})
        },
        [router]
    )

    useEffect(() => {
        const timer = setTimeout(() => {
            load(tab, search)
                .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Failed to load")
                )
                .finally(() => setLoading(false))
        }, 300)

        return () => clearTimeout(timer)
    }, [tab, search, load])

    // The scheduling precision, so a scheduled row can say "±30 min".
    useEffect(() => {
        fetch(`${API}/choices`, { credentials: "include", cache: "no-store" })
            .then((r) => r.json())
            .then((j) => {
                if (j?.success) setPrecision(j.data.schedulePrecisionMinutes)
            })
            .catch(() => {
                // Only affects a hint on the row. Not worth a toast.
            })
    }, [])

    async function act(action: string, campaign: EmailCampaignRow) {
        // Cancelling cannot be undone, and send-now reaches real people.
        if (action === "cancel") {
            const unsent = campaign.counts.total - campaign.counts.submitted
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
                    `Send "${campaign.name}" now? This emails real people and ` +
                    "cannot be taken back once it starts."
                )
            ) {
                return
            }
        }

        if (action === "schedule") {
            // Scheduling needs a date, a time and a zone, which belong in
            // the wizard rather than a menu.
            router.push(
                `/admin/operations/email/campaigns/${campaign._id}?step=5`
            )
            return
        }

        setBusyId(campaign._id)
        try {
            const res = await fetch(`${API}/${campaign._id}/action`, {
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
            await load(tab, search)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "That did not work")
        } finally {
            setBusyId(null)
        }
    }

    /** A tab's count, summed across the statuses it covers. */
    function tabCount(tabId: string): number {
        const chosen = TABS.find((t) => t.id === tabId)
        if (!chosen) return 0

        if (!chosen.statuses) {
            // All, minus archived, which has its own tab.
            return Object.entries(counts)
                .filter(([code]) => Number(code) !== CAMPAIGN_STATUS.ARCHIVED)
                .reduce((sum, [, n]) => sum + n, 0)
        }

        return chosen.statuses.reduce(
            (sum, status) => sum + (counts[String(status)] ?? 0),
            0
        )
    }

    if (forbidden) return <AccessDenied message={forbidden} />

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Campaigns
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Each campaign keeps the recipients it was given when it
                        started, so editing a lead later does not change what was
                        sent.
                    </p>
                </div>

                <Link
                    href="/admin/operations/email/campaigns/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                    <Plus size={15} />
                    New campaign
                </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="w-0 min-w-full overflow-x-auto sm:min-w-0 sm:flex-1">
                    <div className="flex w-max gap-1">
                        {TABS.map((item) => {
                            const active = tab === item.id
                            const n = tabCount(item.id)

                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setTab(item.id)}
                                    className={clsx(
                                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                                        active
                                            ? "bg-emerald-600 text-white"
                                            : "text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                    )}
                                >
                                    {item.label}
                                    {n > 0 && (
                                        <span
                                            className={clsx(
                                                "rounded px-1 text-[10px]",
                                                active
                                                    ? "bg-white/20"
                                                    : "bg-slate-200 dark:bg-neutral-700"
                                            )}
                                        >
                                            {n}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="relative min-w-[160px] sm:w-56">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                </div>
            </div>

            {loading ? (
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <Mails size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        {search || tab !== "all"
                            ? "Nothing here"
                            : "No campaigns yet"}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        {search || tab !== "all"
                            ? "Try another tab or a different search."
                            : "A campaign needs a template and an audience. Both can be made from the sidebar."}
                    </p>
                </div>
            ) : (
                <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    {rows.map((campaign) => (
                        <CampaignRow
                            key={campaign._id}
                            campaign={campaign}
                            precisionMinutes={precision}
                            busy={busyId === campaign._id}
                            onAction={act}
                        />
                    ))}
                </ul>
            )}

            {/* Status legend, so the colours mean something on first sight. */}
            {rows.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-neutral-500">
                    {[
                        CAMPAIGN_STATUS.SENDING,
                        CAMPAIGN_STATUS.PAUSED,
                        CAMPAIGN_STATUS.HALTED,
                        CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES,
                    ].map((status) => (
                        <span key={status} className="flex items-center gap-1">
                            <span
                                className={clsx(
                                    "h-2 w-2 rounded-full",
                                    CAMPAIGN_STATUS_META[status].dot
                                )}
                            />
                            {CAMPAIGN_STATUS_META[status].label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
