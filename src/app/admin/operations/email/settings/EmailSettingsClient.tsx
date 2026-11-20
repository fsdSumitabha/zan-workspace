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
    Plus,
    PowerOff,
    ShieldAlert,
    Trash2,
    UserRoundCheck,
    XCircle,
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
    EmailSenderIdentityView,
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
            <IdentitySection
                identities={data.identities}
                smtpUser={provider?.user ?? ""}
                canEdit={!readOnly}
                onChanged={load}
            />

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

                {/*
                 * The figure above is what the code assumes. This is what
                 * is really happening. On the Vercel Hobby plan the
                 * built-in cron runs once a day, not every fifteen
                 * minutes, so the two can disagree by a lot and nothing
                 * else in the app would show it.
                 */}
                {data.schedulerLastRunAt ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-neutral-500">
                        It last ran{" "}
                        {new Date(data.schedulerLastRunAt).toLocaleString()}. If
                        that is much older than the interval above, the interval
                        is not what is really happening.
                    </p>
                ) : (
                    <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span>
                            It has never run on this server, so no scheduled
                            campaign will go out. Send now is not affected. See
                            docs/EMAIL_MARKETING_SCHEDULING.md.
                        </span>
                    </p>
                )}
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

/**
 * Sender identities: who a campaign appears to come from.
 *
 * This is not the connection above, and the difference is the question
 * everybody asks on this screen. The connection is the mailbox that
 * carries the mail, and a passing test only proves Gmail will take it.
 * An identity is what the reader sees: a name, an address a reply goes
 * to, and the postal address printed in the footer. No connection test
 * can supply those, because only a person can say what they should be.
 *
 * Quotations need no identity. They go from the sales mailbox as itself.
 * Only campaigns need one, because marketing email must carry a postal
 * address.
 */
function IdentitySection({
    identities,
    smtpUser,
    canEdit,
    onChanged,
}: {
    identities: EmailSenderIdentityView[]
    smtpUser: string
    canEdit: boolean
    onChanged: () => Promise<void>
}) {
    // Open from the start when there is none. That state stops every
    // campaign, so the form is the answer. A button hiding it would only
    // be one more click in the way of the one thing left to do.
    const [open, setOpen] = useState(identities.length === 0)
    const [saving, setSaving] = useState(false)
    const [removingId, setRemovingId] = useState("")

    const [fromName, setFromName] = useState("")
    const [fromEmail, setFromEmail] = useState(smtpUser)
    const [replyTo, setReplyTo] = useState("")
    const [postalAddress, setPostalAddress] = useState("")
    const [confirmed, setConfirmed] = useState(false)

    const first = identities.length === 0
    const ready =
        fromName.trim() !== "" &&
        fromEmail.trim() !== "" &&
        postalAddress.trim() !== ""

    // Gmail rewrites the From header to the account that signed in,
    // unless the address is confirmed in that account under "Send mail
    // as". Another address is allowed here, because that alias is a
    // normal thing to set up. But say so now, rather than let the first
    // campaign arrive from an address nobody chose.
    const mismatch =
        smtpUser !== "" &&
        fromEmail.trim() !== "" &&
        fromEmail.trim().toLowerCase() !== smtpUser.toLowerCase()

    const save = async () => {
        if (saving || !ready) return
        setSaving(true)
        try {
            const res = await fetch(`${API}/identities`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fromName: fromName.trim(),
                    fromEmail: fromEmail.trim(),
                    replyTo: replyTo.trim() || undefined,
                    postalAddress: postalAddress.trim(),
                    // The first one is always the default. A campaign
                    // that does not name an identity would otherwise
                    // find nothing to send as.
                    isDefault: first,
                    verified: confirmed,
                }),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "That did not save")
            }

            toast.success(
                first
                    ? "Sender identity saved. Campaigns can be sent now."
                    : "Sender identity saved."
            )

            setFromName("")
            setReplyTo("")
            setPostalAddress("")
            setConfirmed(false)
            setOpen(false)
            await onChanged()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "That did not save")
        } finally {
            setSaving(false)
        }
    }

    const remove = async (row: EmailSenderIdentityView) => {
        if (removingId) return
        if (
            !window.confirm(
                `Remove ${row.fromEmail}? A campaign already sent keeps the ` +
                    `address it went out from. A campaign still being written ` +
                    `will need another identity.`
            )
        ) {
            return
        }

        setRemovingId(row._id)
        try {
            const res = await fetch(
                `${API}/identities?id=${encodeURIComponent(row._id)}`,
                { method: "DELETE", credentials: "include" }
            )
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "That did not save")
            }
            toast.success(`${row.fromEmail} removed.`)
            await onChanged()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "That did not save")
        } finally {
            setRemovingId("")
        }
    }

    return (
        <SettingsCard
            title="Sender identities"
            description="Who a campaign appears to come from. This is separate from the connection above: the connection carries the mail, this is the name and address the reader sees."
        >
            {identities.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-neutral-400">
                    No sender identity yet. A campaign cannot be sent without
                    one. Quotations are not affected; they go from the sales
                    mailbox as itself.
                </p>
            ) : (
                <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {identities.map((id) => (
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
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => remove(id)}
                                    disabled={removingId === id._id}
                                    title={`Remove ${id.fromEmail}`}
                                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                                >
                                    {removingId === id._id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Trash2 size={14} />
                                    )}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {!canEdit ? (
                <p className="text-xs text-slate-500 dark:text-neutral-500">
                    You can see these but not change them. Ask an admin or an
                    operations manager to add one.
                </p>
            ) : open ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                            label="Sender name"
                            help="The name in the inbox. Readers decide whether to open on this."
                        >
                            <input
                                value={fromName}
                                onChange={(e) => setFromName(e.target.value)}
                                maxLength={100}
                                placeholder="Zan Services"
                                className={inputClass}
                            />
                        </Field>

                        <Field
                            label="Sender address"
                            help={
                                smtpUser
                                    ? `Keep this as ${smtpUser} unless that mailbox has the other address set up under "Send mail as".`
                                    : "The address the campaign comes from."
                            }
                        >
                            <input
                                value={fromEmail}
                                onChange={(e) => setFromEmail(e.target.value)}
                                maxLength={255}
                                inputMode="email"
                                placeholder="sales@zanservices.com"
                                className={inputClass}
                            />
                        </Field>
                    </div>

                    {mismatch && (
                        <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>
                                This is not the mailbox that signs in. Gmail will
                                send as {smtpUser} anyway, unless {fromEmail.trim()}{" "}
                                is confirmed in that account under Settings,
                                Accounts, Send mail as.
                            </span>
                        </p>
                    )}

                    <Field
                        label="Reply-to address"
                        help="Optional. Where a reply should land, when that is not the sender address."
                    >
                        <input
                            value={replyTo}
                            onChange={(e) => setReplyTo(e.target.value)}
                            maxLength={255}
                            inputMode="email"
                            placeholder="Leave empty to use the sender address"
                            className={inputClass}
                        />
                    </Field>

                    <Field
                        label="Postal address"
                        help="Your company's full street address, not just a PIN code. It is printed at the bottom of every campaign, because the law asks for an address a reader could post a letter to. A missing one is also read as spam."
                    >
                        <textarea
                            value={postalAddress}
                            onChange={(e) => setPostalAddress(e.target.value)}
                            maxLength={500}
                            rows={2}
                            placeholder="Zan Services, 12 Example Road, Kolkata 700001, India"
                            className={inputClass}
                        />
                    </Field>

                    <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-neutral-400">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 dark:border-neutral-700"
                        />
                        <span>
                            SPF, DKIM and DMARC are set up for this domain. Nobody
                            can check this from here, so it is a note with your
                            name and the date. Sending works either way; this only
                            clears the amber tag.
                        </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving || !ready}
                            className={buttonPrimary}
                        >
                            {saving ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <CheckCircle2 size={14} />
                            )}
                            {saving ? "Saving..." : "Save sender identity"}
                        </button>

                        {!first && (
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={saving}
                                className={buttonGhost}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={buttonGhost}
                >
                    <Plus size={14} />
                    Add another sender identity
                </button>
            )}
        </SettingsCard>
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
