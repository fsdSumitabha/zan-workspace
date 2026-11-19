"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    AlertTriangle,
    CheckCircle2,
    Globe,
    Loader2,
    Plug,
    PowerOff,
    Save,
    ShieldAlert,
    Sliders,
    UserRoundCheck,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import SettingsCard, {
    Field,
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

/** Which delivery fields the screen shows, and in what order. */
const DELIVERY_FIELDS: Array<{
    key: keyof DeliverySettingsView
    label: string
    step?: number
}> = [
    { key: "globalCampaignConcurrency", label: "Campaigns sending at once" },
    { key: "maxJobsPerInvocation", label: "Recipients per worker" },
    { key: "sendConcurrency", label: "Emails in flight per worker" },
    { key: "workerDurationBudgetMs", label: "Worker time budget (ms)" },
    { key: "workerSafetyFraction", label: "Safety fraction", step: 0.05 },
    { key: "leaseDurationMs", label: "Lease duration (ms)" },
    { key: "maxAttemptsTransient", label: "Retries for temporary failures" },
    { key: "backoffBaseMs", label: "First retry wait (ms)" },
    { key: "backoffMaxMs", label: "Longest retry wait (ms)" },
    { key: "heartbeatIntervalMinutes", label: "Scheduler interval (minutes)" },
    { key: "bounceRateThreshold", label: "Bounce limit", step: 0.01 },
    { key: "bounceRateMinSample", label: "Bounce limit applies after" },
]

export default function EmailSettingsClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [data, setData] = useState<EmailSettingsLoaded | null>(null)
    /**
     * Set when the session is looking at several regions. These settings
     * are per region, so there is nothing to show until one is picked.
     */
    const [needRegion, setNeedRegion] = useState<string[] | null>(null)

    // The SMTP form. `pass` is write-only: it starts empty even when a
    // password is stored, and an empty box means "keep the saved one".
    const [form, setForm] = useState({
        name: "",
        host: "",
        port: 465,
        secure: true,
        user: "",
        pass: "",
        globalPerSecond: 2,
        globalPerDay: 500,
        maxConnections: 1,
        maxMessages: 100,
        reportsDelivery: false,
        reportsBounces: false,
    })

    const [delivery, setDelivery] = useState<DeliverySettingsView | null>(null)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<SmtpTestResult | null>(null)

    const load = useCallback(async () => {
        const res = await fetch(API, { credentials: "include", cache: "no-store" })
        const json = await res.json().catch(() => null)

        if (handleAuthError(res, json, router, setForbidden)) return

        if (!res.ok || !json?.success) {
            throw new Error(json?.message || "Failed to load the settings")
        }

        const body = json.data as EmailSettingsResponse

        if (body.needsRegionPick) {
            setNeedRegion(body.regionsInView)
            setData(null)
            return
        }

        setNeedRegion(null)
        setData(body)
        setDelivery(body.delivery)

        // An existing connection fills the form. A new one starts from the
        // SMTP_* env vars the app already uses, so nobody retypes them.
        const p = body.provider
        const s = body.suggestion

        setForm({
            name: p?.name ?? "Default",
            host: p?.host ?? s?.host ?? "",
            port: p?.port ?? s?.port ?? 465,
            secure: p?.secure ?? s?.secure ?? true,
            user: p?.user ?? s?.user ?? "",
            pass: "",
            globalPerSecond: p?.globalPerSecond ?? 2,
            globalPerDay: p?.globalPerDay ?? 500,
            maxConnections: p?.maxConnections ?? 1,
            maxMessages: p?.maxMessages ?? 100,
            reportsDelivery: p?.reportsDelivery ?? false,
            reportsBounces: p?.reportsBounces ?? false,
        })
    }, [router])

    useEffect(() => {
        load()
            .catch((e: unknown) => {
                toast.error(e instanceof Error ? e.message : "Failed to load")
            })
            .finally(() => setLoading(false))
    }, [load])

    async function save() {
        if (!delivery) return
        setSaving(true)

        try {
            const res = await fetch(API, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, delivery }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to save")
            }

            toast.success("Settings saved.")
            setForm((f) => ({ ...f, pass: "" }))
            await load()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    async function test() {
        setTesting(true)
        setTestResult(null)

        try {
            const res = await fetch(`${API}/test`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host: form.host,
                    port: form.port,
                    secure: form.secure,
                    user: form.user,
                    // Empty means "test the saved password".
                    ...(form.pass ? { pass: form.pass } : {}),
                }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "The test could not run")
            }

            const result = json.data as SmtpTestResult
            setTestResult(result)
            if (result.ok) toast.success(result.message)
            else toast.error(result.message)
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
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Email settings
                    </h1>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                        <Globe size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        Pick a region first
                    </h2>
                    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-neutral-400">
                        Each region has its own SMTP connection, its own sender
                        identities and its own sending limits. You are looking at{" "}
                        {needRegion.join(", ")}. Choose one in the switcher at the
                        top of the sidebar to see and change its settings.
                    </p>
                </div>
            </div>
        )
    }

    if (loading || !data || !delivery) {
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

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Email settings
                </h1>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                    The connection campaigns send through, who they come from, and
                    how fast they go out.
                </p>
            </div>

            {/* The encryption key is a hard prerequisite. Saying so here
                saves a confusing 500 on the first save. */}
            {!data.secretKeyReady && (
                <Banner
                    tone="danger"
                    icon={<ShieldAlert size={16} />}
                    title="EMAIL_SECRET_KEY is not set"
                >
                    The SMTP password is stored encrypted, and the key is missing or
                    the wrong length. Add 64 hex characters to{" "}
                    <code className="rounded bg-black/10 px-1 dark:bg-white/10">
                        .env.local
                    </code>{" "}
                    and restart. Generate one with{" "}
                    <code className="rounded bg-black/10 px-1 dark:bg-white/10">
                        node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;
                    </code>
                </Banner>
            )}

            {data.provider?.killSwitch && (
                <Banner
                    tone="danger"
                    icon={<PowerOff size={16} />}
                    title="Sending is switched off"
                >
                    {data.provider.killSwitchReason ||
                        "No campaign will send until this is turned back on."}
                </Banner>
            )}

            {data.capabilityNote && (
                <Banner
                    tone="info"
                    icon={<AlertTriangle size={16} />}
                    title="What this provider can report"
                >
                    {data.capabilityNote}
                </Banner>
            )}

            {/* ---------------- SMTP connection ---------------- */}
            <SettingsCard
                title="SMTP connection"
                description="Campaigns send through this. It is separate from the mail the app already sends for sign-ups and bookings."
                footer={
                    <>
                        {testResult && (
                            <span
                                className={`mr-auto flex items-center gap-1.5 text-xs ${testResult.ok
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                    }`}
                            >
                                {testResult.ok ? (
                                    <CheckCircle2 size={14} />
                                ) : (
                                    <AlertTriangle size={14} />
                                )}
                                {testResult.message}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={test}
                            disabled={testing || readOnly || !form.host || !form.user}
                            className={buttonGhost}
                        >
                            {testing ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Plug size={15} />
                            )}
                            Test connection
                        </button>
                    </>
                }
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name">
                        <input
                            className={inputClass}
                            value={form.name}
                            disabled={readOnly}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Gmail"
                        />
                    </Field>

                    <Field label="Host">
                        <input
                            className={inputClass}
                            value={form.host}
                            disabled={readOnly}
                            onChange={(e) => setForm({ ...form, host: e.target.value })}
                            placeholder="smtp.gmail.com"
                        />
                    </Field>

                    <Field label="Port" help="465 for TLS, 587 for STARTTLS.">
                        <input
                            type="number"
                            className={inputClass}
                            value={form.port}
                            disabled={readOnly}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    port: Number(e.target.value),
                                    secure: Number(e.target.value) === 465,
                                })
                            }
                        />
                    </Field>

                    <Field label="Username">
                        <input
                            className={inputClass}
                            value={form.user}
                            disabled={readOnly}
                            onChange={(e) => setForm({ ...form, user: e.target.value })}
                            placeholder="news@zanservices.com"
                        />
                    </Field>

                    <Field
                        label="Password"
                        help={
                            data.provider?.hasPassword
                                ? "A password is saved. Leave this empty to keep it."
                                : "For Gmail this is an app password, not the account password."
                        }
                    >
                        <input
                            type="password"
                            className={inputClass}
                            value={form.pass}
                            disabled={readOnly}
                            autoComplete="new-password"
                            onChange={(e) => setForm({ ...form, pass: e.target.value })}
                            placeholder={
                                data.provider?.hasPassword ? "••••••••••••" : ""
                            }
                        />
                    </Field>

                    <Field
                        label="Emails per second"
                        help="Shared by every worker, not per worker."
                    >
                        <input
                            type="number"
                            className={inputClass}
                            value={form.globalPerSecond}
                            disabled={readOnly}
                            onChange={(e) =>
                                setForm({ ...form, globalPerSecond: Number(e.target.value) })
                            }
                        />
                    </Field>

                    <Field
                        label="Emails per day"
                        help="A guard against a runaway loop. Gmail stops a Workspace account at 2,000."
                    >
                        <input
                            type="number"
                            className={inputClass}
                            value={form.globalPerDay}
                            disabled={readOnly}
                            onChange={(e) =>
                                setForm({ ...form, globalPerDay: Number(e.target.value) })
                            }
                        />
                    </Field>

                    <Field
                        label="SMTP connections"
                        help="Keep this at 1. Connections multiply across server instances."
                    >
                        <input
                            type="number"
                            className={inputClass}
                            value={form.maxConnections}
                            disabled={readOnly}
                            onChange={(e) =>
                                setForm({ ...form, maxConnections: Number(e.target.value) })
                            }
                        />
                    </Field>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-neutral-800">
                    <Toggle
                        label="This provider confirms deliveries by webhook"
                        help="Leave off for Gmail. With it off, Delivered reads 'not reported' instead of zero."
                        checked={form.reportsDelivery}
                        disabled={readOnly}
                        onChange={(v) => setForm({ ...form, reportsDelivery: v })}
                    />
                    <Toggle
                        label="This provider reports bounces by webhook"
                        help="Leave off for Gmail."
                        checked={form.reportsBounces}
                        disabled={readOnly}
                        onChange={(v) => setForm({ ...form, reportsBounces: v })}
                    />
                </div>
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

            {/* ---------------- Delivery limits ---------------- */}
            <SettingsCard
                title="Delivery limits"
                description={`Scheduled campaigns go out within about ${data.schedulePrecisionMinutes} minutes of the chosen time. Change the scheduler interval below to tighten that.`}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    {DELIVERY_FIELDS.map(({ key, label, step }) => (
                        <Field
                            key={key}
                            label={label}
                            help={`${data.deliveryHelp[key] ?? ""} Default: ${data.deliveryDefaults[key]}.`}
                        >
                            <input
                                type="number"
                                step={step ?? 1}
                                className={inputClass}
                                value={Number(delivery[key])}
                                disabled={readOnly}
                                onChange={(e) =>
                                    setDelivery({
                                        ...delivery,
                                        [key]: Number(e.target.value),
                                    })
                                }
                            />
                        </Field>
                    ))}
                </div>

                <div className="border-t border-slate-100 pt-3 dark:border-neutral-800">
                    <Toggle
                        label="Check the suppression list again before each send"
                        help="Someone can unsubscribe between scheduling and sending. Leave this on."
                        checked={delivery.suppressionRecheckBeforeSend}
                        disabled={readOnly}
                        onChange={(v) =>
                            setDelivery({ ...delivery, suppressionRecheckBeforeSend: v })
                        }
                    />
                </div>
            </SettingsCard>

            {/* ---------------- Safety ---------------- */}
            <SettingsCard
                title="Safety"
                description="Stop every campaign at once. The worker checks this before taking any work, so it takes effect within one cycle."
            >
                <Toggle
                    label="Switch off all sending"
                    help="Nothing goes out while this is on. Campaigns stay where they are and resume when it is turned off."
                    checked={data.provider?.killSwitch ?? false}
                    disabled={readOnly || !data.provider}
                    danger
                    onChange={async (v) => {
                        if (!data.provider) return
                        const reason = v
                            ? window.prompt("Why is sending being switched off?") ?? ""
                            : ""
                        if (v && !reason.trim()) return

                        setData({
                            ...data,
                            provider: {
                                ...data.provider,
                                killSwitch: v,
                                killSwitchReason: reason,
                            },
                        })

                        try {
                            const res = await fetch(API, {
                                method: "PUT",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    ...form,
                                    pass: "",
                                    killSwitch: v,
                                    killSwitchReason: reason,
                                    delivery,
                                }),
                            })
                            if (!res.ok) throw new Error()
                            toast.success(
                                v ? "Sending is switched off." : "Sending is back on."
                            )
                            await load()
                        } catch {
                            toast.error("Could not change the switch.")
                            await load()
                        }
                    }}
                />
            </SettingsCard>

            {!readOnly && (
                <div className="sticky bottom-4 flex justify-end">
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className={`${buttonPrimary} shadow-lg`}
                    >
                        {saving ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <Save size={15} />
                        )}
                        Save settings
                    </button>
                </div>
            )}

            {readOnly && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-neutral-500">
                    <Sliders size={13} />
                    You can read these settings but not change them.
                </p>
            )}
        </div>
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

function Toggle({
    label,
    help,
    checked,
    disabled,
    danger,
    onChange,
}: {
    label: string
    help?: string
    checked: boolean
    disabled?: boolean
    danger?: boolean
    onChange: (value: boolean) => void
}) {
    const on = danger ? "bg-rose-600" : "bg-emerald-600"

    return (
        <div className="flex items-start gap-3">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? on : "bg-slate-300 dark:bg-neutral-700"
                    }`}
            >
                <span
                    className={`block h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0"
                        }`}
                />
            </button>
            <div className="min-w-0">
                <div className="text-sm text-slate-800 dark:text-neutral-200">
                    {label}
                </div>
                {help && (
                    <div className="text-xs text-slate-500 dark:text-neutral-500">
                        {help}
                    </div>
                )}
            </div>
        </div>
    )
}
