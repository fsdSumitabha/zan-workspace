"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Calendar,
    Check,
    Clock,
    Eye,
    Loader2,
    Send,
    Users,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import WizardSteps from "@/components/admin/email/campaign/WizardSteps"
import ExclusionBreakdown from "@/components/admin/email/audience/ExclusionBreakdown"
import { getBrowserTimeZone } from "@/lib/time/zone"
import type {
    AudiencePreviewView,
    CampaignChoices,
    EmailCampaignRow,
} from "@/types/email"

const API = "/api/admin/operations/email/campaigns"

const STEPS = [
    "Details",
    "Content",
    "Audience",
    "Personalise",
    "Schedule",
    "Review",
]

interface Draft {
    name: string
    subject: string
    preheader: string
    senderIdentityId: string
    templateId: string
    templateVersionId: string
    audienceId: string
    fallbacks: Record<string, string>
    scheduleMode: "now" | "later"
    scheduleWall: string
    scheduleZone: string
}

export default function CampaignWizard() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [choices, setChoices] = useState<CampaignChoices | null>(null)
    const [step, setStep] = useState(0)
    const [furthest, setFurthest] = useState(0)
    const [busy, setBusy] = useState(false)

    const [draft, setDraft] = useState<Draft>({
        name: "",
        subject: "",
        preheader: "",
        senderIdentityId: "",
        templateId: "",
        templateVersionId: "",
        audienceId: "",
        fallbacks: {},
        scheduleMode: "later",
        scheduleWall: "",
        scheduleZone: "Asia/Kolkata",
    })

    const [preview, setPreview] = useState<AudiencePreviewView | null>(null)
    const [previewing, setPreviewing] = useState(false)

    /* ---------------------------------------------------------------- */

    useEffect(() => {
        async function load() {
            const res = await fetch(`${API}/choices`, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not load the options")
            }

            const data = json.data as CampaignChoices
            setChoices(data)

            setDraft((d) => ({
                ...d,
                senderIdentityId:
                    data.identities.find((i) => i.isDefault)?._id ??
                    data.identities[0]?._id ??
                    "",
                scheduleZone: getBrowserTimeZone(),
                fallbacks: Object.fromEntries(
                    data.mergeTokens.map((t) => [t.key, t.defaultFallback])
                ),
            }))
        }

        load()
            .catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Could not load")
            )
            .finally(() => setLoading(false))
    }, [router])

    /* ---- The live recipient count on step 3 ---- */

    const requestId = useRef(0)

    const countAudience = useCallback(
        async (audienceId: string) => {
            if (!audienceId) {
                setPreview(null)
                return
            }

            const id = ++requestId.current
            setPreviewing(true)

            try {
                const res = await fetch(
                    "/api/admin/operations/email/audiences/preview",
                    {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ audienceId }),
                    }
                )
                const json = await res.json().catch(() => null)

                if (id !== requestId.current) return
                if (handleAuthError(res, json, router, setForbidden)) return

                if (!res.ok || !json?.success) {
                    throw new Error(json?.message || "Could not count")
                }

                setPreview(json.data as AudiencePreviewView)
            } catch (e: unknown) {
                if (id === requestId.current) {
                    toast.error(e instanceof Error ? e.message : "Could not count")
                }
            } finally {
                if (id === requestId.current) setPreviewing(false)
            }
        },
        [router]
    )

    useEffect(() => {
        if (step === 2 || step === 5) countAudience(draft.audienceId)
    }, [step, draft.audienceId, countAudience])

    /* ---------------------------------------------------------------- */

    function go(next: number) {
        setStep(next)
        setFurthest((f) => Math.max(f, next))
    }

    /** What stops the person moving on, or empty when nothing does. */
    function blocker(atStep: number): string {
        switch (atStep) {
            case 0:
                if (!draft.name.trim()) return "Give the campaign a name."
                if (!draft.subject.trim()) return "Write a subject line."
                if (!draft.senderIdentityId) return "Choose who it comes from."
                return ""
            case 1:
                if (!draft.templateVersionId) return "Pick a template."
                return ""
            case 2:
                if (!draft.audienceId) return "Pick an audience."
                if (preview && preview.eligibleTotal === 0) {
                    return "That audience reaches nobody."
                }
                return ""
            case 4:
                if (draft.scheduleMode === "later") {
                    if (!draft.scheduleWall) return "Pick a date and a time."
                    if (new Date(draft.scheduleWall).getTime() <= Date.now()) {
                        return "That time has already passed."
                    }
                }
                return ""
            default:
                return ""
        }
    }

    /**
     * Creates the campaign, then schedules or sends it.
     *
     * Two calls rather than one: the campaign exists as a draft first, so a
     * failure at the send step leaves something to come back to rather than
     * losing six screens of choices.
     */
    async function finish() {
        setBusy(true)

        try {
            const createRes = await fetch(API, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: draft.name.trim(),
                    subject: draft.subject.trim(),
                    preheader: draft.preheader.trim(),
                    templateId: draft.templateId,
                    templateVersionId: draft.templateVersionId,
                    senderIdentityId: draft.senderIdentityId,
                    audienceId: draft.audienceId,
                }),
            })
            const createJson = await createRes.json().catch(() => null)

            if (handleAuthError(createRes, createJson, router, setForbidden)) return

            if (!createRes.ok || !createJson?.success) {
                throw new Error(createJson?.message || "Could not create")
            }

            const campaign = createJson.data as EmailCampaignRow

            // Fallbacks are a separate PATCH: the create route takes the
            // defaults, and only a changed one is worth sending.
            await fetch(`${API}/${campaign._id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mergeFallbacks: draft.fallbacks }),
            })

            const actionRes = await fetch(`${API}/${campaign._id}/action`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    draft.scheduleMode === "now"
                        ? { action: "send-now" }
                        : {
                              action: "schedule",
                              scheduleWall: draft.scheduleWall,
                              scheduleZone: draft.scheduleZone,
                          }
                ),
            })
            const actionJson = await actionRes.json().catch(() => null)

            if (!actionRes.ok || !actionJson?.success) {
                // The campaign exists as a draft. Say so, and send them to
                // it, rather than leaving them wondering what happened.
                toast.error(
                    actionJson?.message ??
                    "The campaign was saved as a draft but could not start."
                )
                router.push(
                    `/admin/operations/email/campaigns/${campaign._id}`
                )
                return
            }

            toast.success(actionJson.data?.message ?? "Done.")
            router.push(`/admin/operations/email/campaigns/${campaign._id}`)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not finish")
        } finally {
            setBusy(false)
        }
    }

    /* ---------------------------------------------------------------- */

    if (forbidden) return <AccessDenied message={forbidden} />

    if (loading || !choices) {
        return (
            <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        )
    }

    const r = choices.readiness

    // The things that must exist before a campaign can be built at all.
    const missing: Array<{ what: string; where: string; href: string }> = []
    if (!r.providerReady)
        missing.push({
            what: "the sales mailbox",
            where: "set SALES_SMTP_* on the server",
            href: "/admin/operations/email/settings",
        })
    if (!r.identityReady)
        missing.push({
            what: "a sender identity",
            where: "Settings",
            href: "/admin/operations/email/settings",
        })
    if (!r.templateReady)
        missing.push({
            what: "a saved template",
            where: "Templates",
            href: "/admin/operations/email/templates",
        })
    if (!r.audienceReady)
        missing.push({
            what: "an audience",
            where: "Audiences",
            href: "/admin/operations/email/audiences",
        })

    if (missing.length > 0) {
        return (
            <div className="space-y-4">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                    New campaign
                </h1>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-5 dark:border-amber-900/50 dark:bg-amber-950/40">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                        <AlertTriangle size={16} />
                        A few things are needed first
                    </div>
                    <ul className="mt-3 space-y-2">
                        {missing.map((item) => (
                            <li
                                key={item.what}
                                className="flex flex-wrap items-center gap-2 text-sm text-amber-900 dark:text-amber-200"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                <span>You need {item.what}.</span>
                                <Link
                                    href={item.href}
                                    className="font-medium underline underline-offset-2"
                                >
                                    {item.where}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )
    }

    const stop = blocker(step)
    const chosenTemplate = choices.templates.find(
        (t) => t._id === draft.templateId
    )
    const chosenAudience = choices.audiences.find(
        (a) => a._id === draft.audienceId
    )
    const chosenIdentity = choices.identities.find(
        (i) => i._id === draft.senderIdentityId
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        New campaign
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Step {step + 1} of {STEPS.length}: {STEPS[step]}
                    </p>
                </div>

                <Link
                    href="/admin/operations/email/campaigns"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                    Cancel
                </Link>
            </div>

            <WizardSteps
                steps={STEPS}
                current={step}
                furthest={furthest}
                onGo={go}
            />

            {r.killSwitch && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    Sending is switched off in Settings. This campaign can be
                    scheduled, but nothing will go out until it is turned back
                    on.
                </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                {/* ---------- Step 1: Details ---------- */}
                {step === 0 && (
                    <div className="space-y-4">
                        <Field label="Campaign name" help="Only you see this.">
                            <input
                                value={draft.name}
                                onChange={(e) =>
                                    setDraft({ ...draft, name: e.target.value })
                                }
                                placeholder="December update"
                                className={inputClass}
                            />
                        </Field>

                        <Field
                            label="Subject line"
                            help="Merge fields work here too, for example Hello {{first_name}}."
                        >
                            <input
                                value={draft.subject}
                                onChange={(e) =>
                                    setDraft({ ...draft, subject: e.target.value })
                                }
                                placeholder="Your December project update"
                                className={inputClass}
                            />
                        </Field>

                        <Field
                            label="Preview text"
                            help="The line inboxes show next to the subject. Optional."
                        >
                            <input
                                value={draft.preheader}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        preheader: e.target.value,
                                    })
                                }
                                className={inputClass}
                            />
                        </Field>

                        <Field label="From">
                            <select
                                value={draft.senderIdentityId}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        senderIdentityId: e.target.value,
                                    })
                                }
                                className={inputClass}
                            >
                                {choices.identities.map((identity) => (
                                    <option key={identity._id} value={identity._id}>
                                        {identity.fromName} &lt;{identity.fromEmail}&gt;
                                        {identity.verified ? "" : " (domain not confirmed)"}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                )}

                {/* ---------- Step 2: Content ---------- */}
                {step === 1 && (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-500 dark:text-neutral-400">
                            The campaign is pinned to the template&apos;s current
                            version. Editing the template afterwards will not
                            change this campaign.
                        </p>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {choices.templates.map((template) => {
                                const active = draft.templateId === template._id

                                return (
                                    <button
                                        key={template._id}
                                        type="button"
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                templateId: template._id,
                                                templateVersionId:
                                                    template.versionId ?? "",
                                            })
                                        }
                                        className={clsx(
                                            "rounded-lg border p-3 text-left transition",
                                            active
                                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                                                : "border-slate-200 hover:border-emerald-300 dark:border-neutral-700 dark:hover:border-emerald-700"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                                {template.name}
                                            </span>
                                            {active && (
                                                <Check
                                                    size={14}
                                                    className="shrink-0 text-emerald-600"
                                                />
                                            )}
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-500 dark:text-neutral-500">
                                            Version {template.version} ·{" "}
                                            {Math.round(template.htmlBytes / 1024)} KB
                                            {template.mergeTokens.length > 0 &&
                                                ` · ${template.mergeTokens.length} merge fields`}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* ---------- Step 3: Audience ---------- */}
                {step === 2 && (
                    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                        <div className="space-y-2">
                            {choices.audiences.map((audience) => {
                                const active = draft.audienceId === audience._id

                                return (
                                    <button
                                        key={audience._id}
                                        type="button"
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                audienceId: audience._id,
                                            })
                                        }
                                        className={clsx(
                                            "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                                            active
                                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                                                : "border-slate-200 hover:border-emerald-300 dark:border-neutral-700 dark:hover:border-emerald-700"
                                        )}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                                {audience.name}
                                            </div>
                                            {audience.description && (
                                                <div className="truncate text-xs text-slate-500 dark:text-neutral-400">
                                                    {audience.description}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400">
                                            <Users size={12} />
                                            {audience.lastCount ?? "—"}
                                        </div>
                                        {active && (
                                            <Check
                                                size={14}
                                                className="shrink-0 text-emerald-600"
                                            />
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="lg:sticky lg:top-4 lg:self-start">
                            <ExclusionBreakdown
                                preview={preview}
                                loading={previewing}
                            />
                        </div>
                    </div>
                )}

                {/* ---------- Step 4: Personalise ---------- */}
                {step === 3 && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 dark:text-neutral-400">
                            What to print when a recipient has no value for a
                            merge field. A blank fallback prints nothing.
                        </p>

                        {chosenTemplate && chosenTemplate.mergeTokens.length === 0 ? (
                            <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-neutral-800/50 dark:text-neutral-400">
                                This template uses no merge fields, so there is
                                nothing to set here.
                            </p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {choices.mergeTokens
                                    .filter(
                                        (token) =>
                                            !chosenTemplate ||
                                            chosenTemplate.mergeTokens.includes(
                                                token.key
                                            ) ||
                                            draft.subject.includes(`{{${token.key}}}`)
                                    )
                                    .map((token) => (
                                        <Field
                                            key={token.key}
                                            label={token.label}
                                            help={`{{${token.key}}} · example: ${token.sample}`}
                                        >
                                            <input
                                                value={draft.fallbacks[token.key] ?? ""}
                                                onChange={(e) =>
                                                    setDraft({
                                                        ...draft,
                                                        fallbacks: {
                                                            ...draft.fallbacks,
                                                            [token.key]: e.target.value,
                                                        },
                                                    })
                                                }
                                                placeholder="(nothing)"
                                                className={inputClass}
                                            />
                                        </Field>
                                    ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ---------- Step 5: Schedule ---------- */}
                {step === 4 && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            {(
                                [
                                    { value: "later", label: "Schedule it", icon: Calendar },
                                    { value: "now", label: "Send now", icon: Send },
                                ] as const
                            ).map((option) => {
                                const Icon = option.icon
                                const active = draft.scheduleMode === option.value

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                scheduleMode: option.value,
                                            })
                                        }
                                        className={clsx(
                                            "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition",
                                            active
                                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                : "border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-neutral-700 dark:text-neutral-300"
                                        )}
                                    >
                                        <Icon size={15} />
                                        {option.label}
                                    </button>
                                )
                            })}
                        </div>

                        {draft.scheduleMode === "later" ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Date and time">
                                    <input
                                        type="datetime-local"
                                        value={draft.scheduleWall}
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                scheduleWall: e.target.value.slice(0, 16),
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </Field>

                                <Field label="Time zone">
                                    <select
                                        value={draft.scheduleZone}
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                scheduleZone: e.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    >
                                        {choices.zones.map((zone) => (
                                            <option key={zone.zone} value={zone.zone}>
                                                {zone.place}
                                                {zone.hint ? ` (${zone.hint})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                        ) : (
                            <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                This starts sending as soon as you confirm on the
                                next screen. It cannot be taken back once it
                                starts, though it can be paused.
                            </p>
                        )}

                        {/* The honest promise about timing. */}
                        {draft.scheduleMode === "later" &&
                            choices.schedulePrecisionMinutes !== null && (
                                <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-neutral-500">
                                    <Clock size={13} className="mt-0.5 shrink-0" />
                                    Campaigns go out within about{" "}
                                    {choices.schedulePrecisionMinutes} minutes of the
                                    time you choose. The scheduler runs on an
                                    interval rather than to the second.
                                </p>
                            )}
                    </div>
                )}

                {/* ---------- Step 6: Review ---------- */}
                {step === 5 && (
                    <div className="space-y-4">
                        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-neutral-800 dark:border-neutral-700">
                            <Summary label="Audience">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                    {preview?.eligibleTotal ?? "—"} recipients
                                </span>
                                {chosenAudience && (
                                    <span className="text-slate-500 dark:text-neutral-400">
                                        {" "}
                                        from {chosenAudience.name}
                                    </span>
                                )}
                            </Summary>
                            <Summary label="From">
                                {chosenIdentity
                                    ? `${chosenIdentity.fromName} <${chosenIdentity.fromEmail}>`
                                    : "—"}
                            </Summary>
                            <Summary label="Subject">{draft.subject}</Summary>
                            <Summary label="Template">
                                {chosenTemplate
                                    ? `${chosenTemplate.name}, version ${chosenTemplate.version}`
                                    : "—"}
                            </Summary>
                            <Summary label="When">
                                {draft.scheduleMode === "now" ? (
                                    "As soon as you confirm"
                                ) : (
                                    <>
                                        {draft.scheduleWall.replace("T", " ")}{" "}
                                        {draft.scheduleZone}
                                        {choices.schedulePrecisionMinutes !== null && (
                                            <span className="text-slate-500 dark:text-neutral-400">
                                                {" "}
                                                (within about{" "}
                                                {choices.schedulePrecisionMinutes} min)
                                            </span>
                                        )}
                                    </>
                                )}
                            </Summary>
                            <Summary label="Estimated time">
                                {estimate(
                                    preview?.eligibleTotal ?? 0,
                                    r.sendRatePerSecond
                                )}
                            </Summary>
                        </dl>

                        {!r.reportsDelivery && (
                            <p className="flex items-start gap-1.5 rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                                <Eye size={13} className="mt-0.5 shrink-0" />
                                {r.capabilityNote ||
                                    "This provider does not confirm deliveries, so the report will show what was accepted by the server rather than what arrived."}
                            </p>
                        )}

                        {preview && preview.breakdown.length > 0 && (
                            <details className="rounded-lg border border-slate-200 px-3 py-2 dark:border-neutral-700">
                                <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-neutral-300">
                                    {preview.matchedTotal - preview.eligibleTotal} matched
                                    records will not be sent to
                                </summary>
                                <ul className="mt-2 space-y-0.5">
                                    {preview.breakdown.map((item) => (
                                        <li
                                            key={item.key}
                                            className="flex justify-between text-xs text-slate-500 dark:text-neutral-400"
                                        >
                                            <span>{item.label}</span>
                                            <span className="tabular-nums">
                                                {item.count}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {/* ---------- Navigation ---------- */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => go(Math.max(0, step - 1))}
                    disabled={step === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                    <ArrowLeft size={15} />
                    Back
                </button>

                <div className="flex items-center gap-3">
                    {stop && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                            {stop}
                        </span>
                    )}

                    {step < STEPS.length - 1 ? (
                        <button
                            type="button"
                            onClick={() => go(step + 1)}
                            disabled={Boolean(stop)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                            Next
                            <ArrowRight size={15} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={finish}
                            disabled={busy || Boolean(blocker(4))}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {busy ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : draft.scheduleMode === "now" ? (
                                <Send size={15} />
                            ) : (
                                <Calendar size={15} />
                            )}
                            {draft.scheduleMode === "now"
                                ? `Send to ${preview?.eligibleTotal ?? 0} people`
                                : "Schedule campaign"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */

const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition " +
    "focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"

function Field({
    label,
    help,
    children,
}: {
    label: string
    help?: string
    children: React.ReactNode
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                {label}
            </span>
            {children}
            {help && (
                <span className="mt-1 block text-[11px] text-slate-500 dark:text-neutral-500">
                    {help}
                </span>
            )}
        </label>
    )
}

function Summary({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-wrap gap-2 px-3 py-2.5">
            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-neutral-500">
                {label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm text-slate-800 dark:text-neutral-200">
                {children}
            </dd>
        </div>
    )
}

/** How long a send will take at the configured rate. */
function estimate(recipients: number, perSecond: number): string {
    if (recipients === 0 || perSecond <= 0) return "—"

    const seconds = Math.ceil(recipients / perSecond)

    if (seconds < 60) return `about ${seconds} seconds`
    if (seconds < 3_600) return `about ${Math.ceil(seconds / 60)} minutes`

    return `about ${(seconds / 3_600).toFixed(1)} hours`
}
