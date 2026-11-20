"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    AlertTriangle,
    Check,
    Clock,
    Gauge,
    Globe,
    Info,
    PowerOff,
    Settings,
    ShieldBan,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"

interface Overview {
    /** Null when the session is looking at several regions at once. */
    region: string | null
    regionsInView: string[]
    setup: {
        providerReady: boolean
        providerName: string
        identityReady: boolean
        killSwitch: boolean
        killSwitchReason: string
        lastTestOk: boolean | null
        lastTestMessage: string
    }
    capability: {
        reportsDelivery: boolean
        reportsBounces: boolean
        note: string
    } | null
    campaigns: {
        total: number
        draft: number
        scheduled: number
        sending: number
        completed: number
        failed: number
    }
    suppressionCount: number
    /** Null when no single region is picked. */
    schedulePrecisionMinutes: number | null
    sendRatePerSecond: number
    dailyBudget: number
    canAdminister: boolean
}

export default function EmailOverviewClient() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [data, setData] = useState<Overview | null>(null)

    const load = useCallback(async () => {
        const res = await fetch("/api/admin/operations/email/overview", {
            credentials: "include",
            cache: "no-store",
        })
        const json = await res.json().catch(() => null)

        if (handleAuthError(res, json, router, setForbidden)) return

        if (!res.ok || !json?.success) {
            throw new Error(json?.message || "Failed to load the overview")
        }

        setData(json.data as Overview)
    }, [router])

    useEffect(() => {
        load()
            .catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Failed to load")
            )
            .finally(() => setLoading(false))
    }, [load])

    if (forbidden) return <AccessDenied message={forbidden} />

    if (loading || !data) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
                <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            </div>
        )
    }

    const { setup, campaigns } = data

    // The SMTP connection and the limits belong to one region. With several
    // in view there is nothing honest to show, so the checklist and the
    // facts are replaced by a line that says which switch to use.
    const multiRegion = data.region === null

    const steps = [
        {
            done: setup.providerReady,
            label: setup.providerName
                ? `Sales mailbox is set up (${setup.providerName})`
                : "Sales mailbox is set up",
            detail:
                !setup.providerReady
                    ? "Set SALES_SMTP_HOST, SALES_SMTP_PORT, SALES_SMTP_USER and SALES_SMTP_PASS on the server."
                    : setup.lastTestOk === null
                      ? "Press Test connection in Settings to prove it signs in."
                      : setup.lastTestOk
                        ? "The last test signed in successfully."
                        : setup.lastTestMessage,
        },
        {
            done: setup.identityReady,
            label: "A sender identity exists",
            detail:
                "Who campaigns come from, with a postal address for the footer.",
        },
    ]

    const remaining = steps.filter((s) => !s.done).length

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Email marketing
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Campaigns to leads, clients and imported contacts.
                    </p>
                </div>
                {data.canAdminister && (
                    <Link
                        href="/admin/operations/email/settings"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                        <Settings size={15} />
                        Settings
                    </Link>
                )}
            </div>

            {setup.killSwitch && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    <div className="flex items-center gap-2 font-medium">
                        <PowerOff size={16} />
                        Sending is switched off
                    </div>
                    <p className="mt-1 text-xs opacity-90">
                        {setup.killSwitchReason ||
                            "No campaign will send until this is turned back on."}
                    </p>
                </div>
            )}

            {multiRegion && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
                    <div className="flex items-center gap-2 font-medium">
                        <Globe size={16} />
                        Showing {data.regionsInView.join(", ")} together
                    </div>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">
                        The campaign counts below cover every region. The sending
                        connection and the limits belong to one region each, so
                        pick a region in the switcher at the top of the sidebar to
                        see them.
                    </p>
                </div>
            )}

            {/* Setup checklist. It disappears once the three steps are done,
                and it is hidden entirely while several regions are in view,
                because it would be checking one region's setup. */}
            {!multiRegion && remaining > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <header className="border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Setup
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">
                            {remaining === 1
                                ? "One step left before a campaign can be sent."
                                : `${remaining} steps left before a campaign can be sent.`}
                        </p>
                    </header>

                    <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                        {steps.map((step) => (
                            <li key={step.label} className="flex gap-3 px-4 py-3">
                                <span
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.done
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                        : "bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500"
                                        }`}
                                >
                                    {step.done ? (
                                        <Check size={13} />
                                    ) : (
                                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <div
                                        className={`text-sm ${step.done
                                            ? "text-slate-500 line-through dark:text-neutral-500"
                                            : "text-slate-900 dark:text-white"
                                            }`}
                                    >
                                        {step.label}
                                    </div>
                                    {step.detail && (
                                        <div className="text-xs text-slate-500 dark:text-neutral-500">
                                            {step.detail}
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Campaign counts. Real counts, including zero. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Tile label="Draft" value={campaigns.draft} />
                <Tile label="Scheduled" value={campaigns.scheduled} />
                <Tile label="Sending" value={campaigns.sending} />
                <Tile label="Completed" value={campaigns.completed} />
                <Tile label="Failed" value={campaigns.failed} tone="danger" />
            </div>

            {/* What the provider can and cannot tell us. This is the honesty
                rule: a Delivered count of zero from Gmail is not a failure,
                it is Gmail not reporting. */}
            {!multiRegion && data.capability && !data.capability.reportsDelivery && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
                    <div className="flex items-center gap-2 font-medium">
                        <Info size={16} />
                        This provider does not confirm deliveries
                    </div>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">
                        {data.capability.note} Reports will show how many emails were
                        accepted by the server, which is not the same as how many
                        arrived.
                    </p>
                </div>
            )}

            <section className="grid gap-3 sm:grid-cols-3">
                <Fact
                    icon={<Clock size={15} />}
                    label="Scheduling"
                    value={
                        data.schedulePrecisionMinutes === null
                            ? "per region"
                            : `within ${data.schedulePrecisionMinutes} min`
                    }
                    detail="How close to the chosen time a scheduled campaign goes out."
                />
                <Fact
                    icon={<Gauge size={15} />}
                    label="Send rate"
                    value={
                        multiRegion
                            ? "per region"
                            : data.sendRatePerSecond
                              ? `${data.sendRatePerSecond}/sec`
                              : "not set"
                    }
                    detail={
                        multiRegion
                            ? "Each region has its own rate."
                            : data.dailyBudget
                              ? `Up to ${data.dailyBudget.toLocaleString()} a day.`
                              : "Set the SMTP connection first."
                    }
                />
                <Fact
                    icon={<ShieldBan size={15} />}
                    label="Suppressed"
                    value={data.suppressionCount.toLocaleString()}
                    detail="Addresses that will never be sent to."
                />
            </section>

            <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-neutral-500">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Campaigns, templates and audiences are still being built. The
                settings on this page are live and are what sending will use.
            </p>
        </div>
    )
}

function Tile({
    label,
    value,
    tone,
}: {
    label: string
    value: number
    tone?: "danger"
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div
                className={`text-xl font-semibold ${tone === "danger" && value > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-900 dark:text-white"
                    }`}
            >
                {value}
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">
                {label}
            </div>
        </div>
    )
}

function Fact({
    icon,
    label,
    value,
    detail,
}: {
    icon: React.ReactNode
    label: string
    value: string
    detail: string
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-neutral-400">
                {icon}
                {label}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                {value}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-neutral-500">
                {detail}
            </div>
        </div>
    )
}
