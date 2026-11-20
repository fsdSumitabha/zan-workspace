"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    CheckCircle2,
    Globe,
    Loader2,
    Plug,
    PowerOff,
    ShieldAlert,
    Sliders,
    UserRoundCheck,
    XCircle,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import SettingsCard, {
    buttonGhost,
    buttonPrimary,
    inputClass,
} from "@/components/admin/email/SettingsCard"
import type {
    DeliverySettingsView,
    EmailSettingsLoaded,
    EmailSettingsResponse,
    SmtpTestResult,
} from "@/types/email"

const API = "/api/admin/operations/email/settings"

/**
 * Email settings: three facts and one switch.
 *
 * Almost nothing here is editable, and that is deliberate. The connection
 * comes from the server's environment, and every limit is a constant
 * derived from what Gmail and Vercel allow. Both are shown so somebody
 * diagnosing a slow or stopped campaign can see what the engine is doing
 * without reading the code.
 *
 * The kill switch is the only control. It is the one thing that has to
 * change while mail is going out.
 */

/**
 * Which numbers the screen shows, in what order, and how to read each one.
 *
 * Milliseconds and fractions are turned into words. "180000" tells a
 * person nothing; "180 seconds" tells them whether it is the problem.
 */
const SHOWN: Array<{
    key: keyof DeliverySettingsView
    label: string
    format?: (value: number) => string
}> = [
    { key: "globalPerSecond", label: "Emails per second", format: (v) => `${v} a second` },
    { key: "globalPerDay", label: "Emails per day", format: (v) => v.toLocaleString() },
    { key: "sendConcurrency", label: "Emails in flight per worker" },
    { key: "maxJobsPerInvocation", label: "Recipients per worker" },
    { key: "globalCampaignConcurrency", label: "Campaigns sending at once" },
    { key: "maxConnections", label: "Connections to the mail server" },
    { key: "workerDurationBudgetMs", label: "Worker time budget", format: secs },
    { key: "workerSafetyFraction", label: "Stops claiming at", format: (v) => `${Math.round(v * 100)}% of the budget` },
    { key: "leaseDurationMs", label: "Lease duration", format: secs },
    { key: "maxAttemptsTransient", label: "Retries for temporary failures" },
    { key: "backoffBaseMs", label: "First retry wait", format: secs },
    { key: "backoffMaxMs", label: "Longest retry wait", format: mins },
    { key: "heartbeatIntervalMinutes", label: "Scheduler interval", format: (v) => `${v} minutes` },
    { key: "bounceRateThreshold", label: "Bounce limit", format: (v) => `${Math.round(v * 100)}%` },
    { key: "bounceRateMinSample", label: "Bounce limit applies after", format: (v) => `${v} sends` },
]

function secs(ms: number): string {
    return `${Math.round(ms / 1000)} seconds`
}

function mins(ms: number): string {
    const m = ms / 60_000
    return m >= 1 ? `${Math.round(m)} minutes` : secs(ms)
}

export default function EmailSettingsClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [data, setData] = useState<EmailSettingsLoaded | null>(null)
    /** The regions in view when there is more than one, so none is picked. */
    const [needRegion, setNeedRegion] = useState<string[] | null>(null)

    const [reason, setReason] = useState("")
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<SmtpTestResult | null>(null)

    const load = useCallback(async () => {
        const res = await fetch(API, { credentials: "include", cache: "no-store" })
        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.success) {
            if (handleAuthError(res, json, router, setForbidden)) {
                setLoading(false)
                return
            }
            setForbidden(json?.message || "You cannot open the email settings.")
            setLoading(false)
            return
        }

        const body = json.data as EmailSettingsResponse

        if (body.needsRegionPick) {
            setNeedRegion(body.regionsInView)
            setLoading(false)
            return
        }

        setNeedRegion(null)
        setData(body)
        setReason(body.provider?.killSwitchReason ?? "")
        setLoading(false)
    }, [router])

    useEffect(() => {
        void load()
    }, [load])

    const setKillSwitch = async (on: boolean) => {
        if (saving) return
        setSaving(true)
        try {
            const res = await fetch(API, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ killSwitch: on, killSwitchReason: reason }),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "That did not save")
            }
            if (on) toast.warning(json.message)
            else toast.success(json.message)
            await load()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "That did not save")
        } finally {
            setSaving(false)
        }
    }

    const testConnection = async () => {
        if (testing) return
        setTesting(true)
        setTestResult(null)
        try {
            const res = await fetch(`${API}/test`, {
                method: "POST",
                credentials: "include",
            })
            const json = await res.json().catch(() => null)
            if (!json?.data) {
                throw new Error(json?.message || "The test could not run")
            }
            const result = json.data as SmtpTestResult
            setTestResult(result)
            if (result.ok) toast.success(result.message)
            else toast.error(result.message, { duration: 12_000 })
            await load()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "The test could not run")
        } finally {
            setTesting(false)
        }
    }

    if (forbidden) return <AccessDenied message={forbidden} />

    if (needRegion) {
        return (
            <div className="space-y-4">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Email settings
                </h1>
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                        <Globe size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        Pick a region first
                    </h2>
                    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-neutral-400">
                        Sending is switched off per region, and each region has its
                        own sender identities. You are looking at{" "}
                        {needRegion.join(", ")}. Choose one in the switcher at the top
                        of the sidebar.
                    </p>
                </div>
            </div>
        )
    }

    if (loading || !data) {
        return (
            <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                    />
                ))}
            </div>
        )
    }

    const readOnly = !data.canEdit
    const provider = data.provider
    const off = provider?.killSwitch ?? false

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Email settings
                </h1>
                <p className="text-sm text-slate-500 dark:text-neutral-400">
                    Region {data.region}. The connection and the limits are set on
                    the server; this screen shows them.
                </p>
            </div>

            {off && (
                <Banner
                    tone="danger"
                    icon={<PowerOff size={16} />}
                    title="Campaign sending is switched off"
                >
                    {provider?.killSwitchReason
                        ? provider.killSwitchReason
                        : "No reason was recorded."}{" "}
                    Recipients stay queued and go out when it is switched back on.
                </Banner>
            )}

            {!provider && (
                <Banner
                    tone="danger"
                    icon={<ShieldAlert size={16} />}
                    title="No sales mailbox on this server"
                >
                    No campaign can send. Set SALES_SMTP_HOST, SALES_SMTP_PORT,
                    SALES_SMTP_USER and SALES_SMTP_PASS in the server environment,
                    then restart it.
                </Banner>
            )}

            {/* ---------------- The connection ---------------- */}
            <SettingsCard
                title="Sending connection"
                description="The sales mailbox, from the server environment. The same one quotations go out from."
            >
                {provider ? (
                    <>
                        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                            <Fact label="From address" value={provider.user} />
                            <Fact label="Server" value={`${provider.host}:${provider.port}`} />
                            <Fact
                                label="Encryption"
                                value={provider.secure ? "TLS" : "STARTTLS"}
                            />
                            <Fact
                                label="Password"
                                value="Set in SALES_SMTP_PASS"
                            />
                        </dl>

                        <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                            To change any of this, edit the SALES_SMTP_* variables on
                            the server and restart it. Nothing is stored in the
                            database, so there is no password here to go stale.
                        </p>

                        {data.capabilityNote && (
                            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                                {data.capabilityNote}
                            </p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={testConnection}
                                disabled={testing}
                                className={buttonGhost}
                            >
                                {testing ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Plug size={14} />
                                )}
                                {testing ? "Testing..." : "Test connection"}
                            </button>

                            <TestLine
                                result={testResult}
                                lastOk={provider.lastTestOk}
                                lastMessage={provider.lastTestMessage}
                            />
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-slate-500 dark:text-neutral-400">
                        Nothing to show until SALES_SMTP_* is set.
                    </p>
                )}
            </SettingsCard>

            {/* ---------------- Sender identities ---------------- */}
            <SettingsCard
                title="Sender identities"
                description="Who a campaign appears to come from. A postal address is required in every marketing email."
            >
                {data.identities.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-neutral-400">
                        No sender identity yet. A campaign cannot be sent without one.
                    </p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                        {data.identities.map((id) => (
                            <li
                                key={id._id}
                                className="flex flex-wrap items-center gap-2 py-2.5"
                            >
                                <UserRoundCheck
                                    size={16}
                                    className={
                                        id.verifiedAt
                                            ? "text-emerald-500"
                                            : "text-slate-400 dark:text-neutral-600"
                                    }
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-slate-900 dark:text-white">
                                        {id.fromName}{" "}
                                        <span className="text-slate-500 dark:text-neutral-400">
                                            &lt;{id.fromEmail}&gt;
                                        </span>
                                    </div>
                                    <div className="truncate text-xs text-slate-500 dark:text-neutral-500">
                                        {id.postalAddress}
                                    </div>
                                </div>
                                {id.isDefault && (
                                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                        Default
                                    </span>
                                )}
                                {!id.verifiedAt && (
                                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                        Domain not confirmed
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </SettingsCard>

            {/* ---------------- The limits ---------------- */}
            <SettingsCard
                title="Delivery limits"
                description="Set in the code, from what Gmail and Vercel allow and from what this app was measured doing. Changing one is a deploy."
            >
                <dl className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {SHOWN.map((row) => {
                        const value = data.delivery[row.key]
                        const shown =
                            typeof value === "number"
                                ? (row.format?.(value) ?? String(value))
                                : value
                                  ? "On"
                                  : "Off"

                        return (
                            <div key={row.key} className="py-2.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <dt className="text-sm text-slate-800 dark:text-neutral-200">
                                        {row.label}
                                    </dt>
                                    <dd className="font-mono text-sm text-slate-900 dark:text-white">
                                        {shown}
                                    </dd>
                                </div>
                                {data.deliveryHelp[row.key] && (
                                    <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                                        {data.deliveryHelp[row.key]}
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </dl>

                <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                    A scheduled campaign can go out up to{" "}
                    {data.schedulePrecisionMinutes} minutes after its chosen time.
                    The scheduler runs on an interval; it is not a clock.
                </p>
            </SettingsCard>

            {/* ---------------- The kill switch ---------------- */}
            <SettingsCard
                title="Kill switch"
                description="Stops every campaign in this region. The fastest thing to do when you do not yet know what is wrong."
            >
                <p className="text-sm text-slate-600 dark:text-neutral-300">
                    Nothing is lost. Every worker checks this before it claims any
                    work, so sending stops within one cycle, and queued recipients go
                    out when it is switched back on.
                </p>

                {!off && (
                    <div className="mt-3">
                        <label
                            htmlFor="killReason"
                            className="mb-1 block text-xs text-slate-600 dark:text-neutral-400"
                        >
                            Why are you stopping it? Whoever finds sending off needs
                            to know whether it is safe to turn back on.
                        </label>
                        <input
                            id="killReason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={readOnly}
                            maxLength={300}
                            placeholder="Bounces climbing on the November campaign"
                            className={inputClass}
                        />
                    </div>
                )}

                <div className="mt-4">
                    {off ? (
                        <button
                            type="button"
                            onClick={() => setKillSwitch(false)}
                            disabled={readOnly || saving}
                            className={buttonPrimary}
                        >
                            {saving ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <CheckCircle2 size={14} />
                            )}
                            Turn sending back on
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setKillSwitch(true)}
                            disabled={readOnly || saving || !reason.trim()}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <PowerOff size={14} />
                            )}
                            Stop all sending
                        </button>
                    )}
                </div>

                {readOnly && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-neutral-500">
                        You can see this but not change it. Ask an admin or an
                        operations manager.
                    </p>
                )}
            </SettingsCard>
        </div>
    )
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-neutral-500">{label}</dt>
            <dd className="truncate font-mono text-sm text-slate-900 dark:text-white">
                {value}
            </dd>
        </div>
    )
}

/**
 * What the last connection test said.
 *
 * A test run just now wins over the stored one, because somebody who has
 * pressed the button is asking about this moment.
 */
function TestLine({
    result,
    lastOk,
    lastMessage,
}: {
    result: SmtpTestResult | null
    lastOk: boolean | null
    lastMessage: string
}) {
    const ok = result ? result.ok : lastOk
    const message = result ? result.message : lastMessage

    if (ok === null) {
        return (
            <span className="text-xs text-slate-500 dark:text-neutral-500">
                Never tested on this server.
            </span>
        )
    }

    return (
        <span
            className={`inline-flex items-center gap-1.5 text-xs ${
                ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
            }`}
        >
            {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {message || (ok ? "Connected and signed in." : "The last test failed.")}
        </span>
    )
}

function Banner({
    tone,
    icon,
    title,
    children,
}: {
    tone: "danger" | "info"
    icon: React.ReactNode
    title: string
    children: React.ReactNode
}) {
    const classes =
        tone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
            : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200"

    return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${classes}`}>
            <div className="flex items-center gap-2 font-medium">
                {icon}
                {title}
            </div>
            <div className="mt-1 text-xs leading-relaxed opacity-90">{children}</div>
        </div>
    )
}
