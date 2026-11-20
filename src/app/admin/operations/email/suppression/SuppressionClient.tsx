"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import { Loader2, Plus, Search, ShieldBan, Trash2, X } from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import {
    SUPPRESSION_REASON,
    SUPPRESSION_REASON_META,
    SUPPRESSION_REASONS,
    type SuppressionReason,
} from "@/constants/emailStatus"
import type { EmailSuppressionRow } from "@/types/email"

const API = "/api/admin/operations/email/suppression"

export default function SuppressionClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<EmailSuppressionRow[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState("")
    const [reason, setReason] = useState<SuppressionReason | null>(null)
    const [addOpen, setAddOpen] = useState(false)

    const load = useCallback(
        async (q: string, r: SuppressionReason | null) => {
            const url = new URL(API, window.location.origin)
            if (q) url.searchParams.set("search", q)
            if (r !== null) url.searchParams.set("reason", String(r))

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to load the list")
            }

            setRows(json.data as EmailSuppressionRow[])
            setCounts(json.counts ?? {})
            setTotal(json.pagination?.total ?? 0)
        },
        [router]
    )

    useEffect(() => {
        const t = setTimeout(() => {
            load(search, reason)
                .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Failed to load")
                )
                .finally(() => setLoading(false))
        }, 300)

        return () => clearTimeout(t)
    }, [search, reason, load])

    async function remove(row: EmailSuppressionRow) {
        if (
            !window.confirm(
                `Take ${row.email} off the suppression list? Campaigns will be ` +
                "able to email them again."
            )
        ) {
            return
        }

        try {
            const res = await fetch(`${API}?id=${row._id}`, {
                method: "DELETE",
                credentials: "include",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not remove")
            }

            toast.success("Removed from the list.")
            setRows((r) => r.filter((x) => x._id !== row._id))
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not remove")
        }
    }

    if (forbidden) return <AccessDenied message={forbidden} />

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Suppression list
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Addresses no campaign will ever reach. Checked when a
                        campaign is built and again immediately before each send.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                    <Plus size={15} />
                    Add addresses
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="relative min-w-[180px] flex-1">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search an address"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                </div>

                <div className="flex w-0 min-w-full gap-1 overflow-x-auto sm:w-auto sm:min-w-0">
                    <Chip
                        active={reason === null}
                        label="All"
                        count={total}
                        onClick={() => setReason(null)}
                    />
                    {SUPPRESSION_REASONS.map((r) => (
                        <Chip
                            key={r}
                            active={reason === r}
                            label={SUPPRESSION_REASON_META[r].label}
                            count={counts[String(r)]}
                            onClick={() => setReason(r)}
                        />
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <ShieldBan size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        {search || reason !== null
                            ? "Nothing matches that"
                            : "Nobody is suppressed"}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        Unsubscribes and hard bounces are added here
                        automatically once campaigns start sending.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                        {rows.map((row) => {
                            const meta =
                                SUPPRESSION_REASON_META[
                                    row.reason as SuppressionReason
                                ]
                            const selfUnsubscribed =
                                row.reason === SUPPRESSION_REASON.UNSUBSCRIBED

                            return (
                                <li
                                    key={row._id}
                                    className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm text-slate-900 dark:text-white">
                                            {row.email}
                                        </div>
                                        {row.note && (
                                            <div className="truncate text-xs text-slate-500 dark:text-neutral-500">
                                                {row.note}
                                            </div>
                                        )}
                                    </div>

                                    <span
                                        className={clsx(
                                            "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium",
                                            meta?.color ?? "bg-slate-500 text-white"
                                        )}
                                    >
                                        {meta?.label ?? "Unknown"}
                                    </span>

                                    <span className="hidden shrink-0 text-xs text-slate-400 sm:block dark:text-neutral-600">
                                        {new Date(row.createdAt).toLocaleDateString()}
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => remove(row)}
                                        disabled={selfUnsubscribed}
                                        title={
                                            selfUnsubscribed
                                                ? "This person unsubscribed themselves. Their choice stands."
                                                : "Remove from the list"
                                        }
                                        className={clsx(
                                            "rounded p-1 transition",
                                            selfUnsubscribed
                                                ? "cursor-not-allowed text-slate-300 dark:text-neutral-700"
                                                : "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                        )}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}

            {addOpen && (
                <AddDialog
                    onClose={() => setAddOpen(false)}
                    onDone={() => {
                        setAddOpen(false)
                        setLoading(true)
                        load(search, reason).finally(() => setLoading(false))
                    }}
                    router={router}
                    onForbidden={setForbidden}
                />
            )}
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

function AddDialog({
    onClose,
    onDone,
    router,
    onForbidden,
}: {
    onClose: () => void
    onDone: () => void
    router: ReturnType<typeof useRouter>
    onForbidden: (message: string) => void
}) {
    const [text, setText] = useState("")
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)

    async function submit() {
        if (!text.trim()) {
            toast.error("Enter at least one address.")
            return
        }

        setBusy(true)
        try {
            const res = await fetch(API, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emails: text,
                    reason: SUPPRESSION_REASON.MANUAL,
                    note: note.trim() || undefined,
                }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, onForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not add")
            }

            const { added, alreadyThere, invalid } = json.data as {
                added: number
                alreadyThere: number
                invalid: string[]
            }

            const parts = [`${added} added`]
            if (alreadyThere > 0) parts.push(`${alreadyThere} already there`)
            if (invalid.length > 0) parts.push(`${invalid.length} not valid`)

            toast.success(parts.join(", ") + ".")
            onDone()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not add")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-neutral-900">
                <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Add to the suppression list
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-neutral-800"
                    >
                        <X size={16} />
                    </button>
                </header>

                <div className="space-y-3 px-4 py-4">
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                            Addresses
                        </span>
                        <textarea
                            rows={6}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={"one@example.com\ntwo@example.com"}
                            className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                        />
                        <span className="mt-1 block text-[11px] text-slate-500 dark:text-neutral-500">
                            One per line, or separated by commas.
                        </span>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                            Why
                        </span>
                        <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Asked us by phone not to be emailed"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                        />
                    </label>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {busy ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Plus size={15} />
                            )}
                            Add
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
