"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import {
    AlertTriangle,
    Check,
    Contact,
    Loader2,
    Search,
    Trash2,
    Upload,
    X,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import type { ContactImportResult, EmailContactRow } from "@/types/email"

const API = "/api/admin/operations/email/contacts"

export default function ContactsClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<EmailContactRow[]>([])
    const [total, setTotal] = useState(0)
    const [consented, setConsented] = useState(0)
    const [search, setSearch] = useState("")
    const [consent, setConsent] = useState<"all" | "yes" | "no">("all")
    const [importOpen, setImportOpen] = useState(false)

    const load = useCallback(
        async (q: string, c: string) => {
            const url = new URL(API, window.location.origin)
            if (q) url.searchParams.set("search", q)
            if (c !== "all") url.searchParams.set("consent", c)

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to load the contacts")
            }

            setRows(json.data as EmailContactRow[])
            setTotal(json.pagination?.total ?? 0)
            setConsented(json.counts?.consented ?? 0)
        },
        [router]
    )

    useEffect(() => {
        const t = setTimeout(() => {
            load(search, consent)
                .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Failed to load")
                )
                .finally(() => setLoading(false))
        }, 300)

        return () => clearTimeout(t)
    }, [search, consent, load])

    async function remove(row: EmailContactRow) {
        if (!window.confirm(`Remove ${row.email} from contacts?`)) return

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

            toast.success("Contact removed.")
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
                        Contacts
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Marketing recipients who are not leads or clients. Leads
                        and clients are read from the CRM and are not copied here.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                    <Upload size={15} />
                    Import a file
                </button>
            </div>

            {total > 0 && consented < total && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                        {(total - consented).toLocaleString()} of{" "}
                        {total.toLocaleString()} contacts have no recorded
                        marketing consent. They are stored, but every audience
                        leaves them out.
                    </span>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="relative min-w-[180px] flex-1">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by email, name or company"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                </div>

                <div className="flex gap-1">
                    {(
                        [
                            { value: "all", label: "All" },
                            { value: "yes", label: "With consent" },
                            { value: "no", label: "No consent" },
                        ] as const
                    ).map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setConsent(option.value)}
                            className={clsx(
                                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                                consent === option.value
                                    ? "bg-emerald-600 text-white"
                                    : "text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <Contact size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        {search || consent !== "all"
                            ? "Nothing matches that"
                            : "No contacts yet"}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        Import a spreadsheet with an Email column. Leads and
                        clients do not need importing.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
                                <th className="px-4 py-2 font-medium">Email</th>
                                <th className="hidden px-4 py-2 font-medium sm:table-cell">
                                    Name
                                </th>
                                <th className="hidden px-4 py-2 font-medium md:table-cell">
                                    Company
                                </th>
                                <th className="px-4 py-2 font-medium">Consent</th>
                                <th className="w-10 px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                            {rows.map((row) => (
                                <tr key={row._id}>
                                    <td className="max-w-[220px] truncate px-4 py-2 text-slate-900 dark:text-white">
                                        {row.email}
                                    </td>
                                    <td className="hidden max-w-[150px] truncate px-4 py-2 text-slate-600 dark:text-neutral-400 sm:table-cell">
                                        {[row.firstName, row.lastName]
                                            .filter(Boolean)
                                            .join(" ") || "—"}
                                    </td>
                                    <td className="hidden max-w-[150px] truncate px-4 py-2 text-slate-600 dark:text-neutral-400 md:table-cell">
                                        {row.company || "—"}
                                    </td>
                                    <td className="px-4 py-2">
                                        {row.marketingConsent &&
                                        !row.consentWithdrawnAt ? (
                                            <span
                                                title={row.consentSource}
                                                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                            >
                                                <Check size={11} />
                                                Yes
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
                                                <X size={11} />
                                                No
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2">
                                        <button
                                            type="button"
                                            onClick={() => remove(row)}
                                            title="Remove"
                                            className="rounded p-1 text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {importOpen && (
                <ImportDialog
                    onClose={() => setImportOpen(false)}
                    onDone={() => {
                        setImportOpen(false)
                        setLoading(true)
                        load(search, consent).finally(() => setLoading(false))
                    }}
                    router={router}
                    onForbidden={setForbidden}
                />
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */

function ImportDialog({
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
    const fileRef = useRef<HTMLInputElement>(null)
    const [consent, setConsent] = useState(false)
    const [note, setNote] = useState("")
    const [tags, setTags] = useState("")
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<ContactImportResult | null>(null)

    async function submit() {
        const file = fileRef.current?.files?.[0]
        if (!file) {
            toast.error("Choose a file first.")
            return
        }

        const form = new FormData()
        form.set("file", file)
        form.set("marketingConsent", String(consent))
        if (note.trim()) form.set("consentNote", note.trim())
        if (tags.trim()) form.set("tags", tags.trim())

        setBusy(true)
        try {
            const res = await fetch(`${API}/import`, {
                method: "POST",
                credentials: "include",
                body: form,
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, onForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not import")
            }

            setResult(json.data as ContactImportResult)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not import")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-neutral-900">
                <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Import contacts
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-neutral-800"
                    >
                        <X size={16} />
                    </button>
                </header>

                {result ? (
                    <div className="space-y-3 px-4 py-4">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <Stat label="Added" value={result.created} tone="good" />
                            <Stat label="Updated" value={result.updated} />
                            <Stat
                                label="Skipped"
                                value={result.skipped}
                                tone={result.skipped > 0 ? "bad" : undefined}
                            />
                        </div>

                        {result.problems.length > 0 && (
                            <div className="rounded-lg border border-slate-200 dark:border-neutral-800">
                                <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-600 dark:border-neutral-800 dark:text-neutral-400">
                                    Rows that did not import
                                </div>
                                <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto text-xs dark:divide-neutral-800">
                                    {result.problems.map((p, i) => (
                                        <li
                                            key={i}
                                            className="flex gap-2 px-3 py-1.5"
                                        >
                                            <span className="w-10 shrink-0 text-slate-400">
                                                {p.row}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-neutral-400">
                                                {p.value || "(empty)"}
                                            </span>
                                            <span className="shrink-0 text-rose-600 dark:text-rose-400">
                                                {p.reason}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onDone}
                            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3 px-4 py-4">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                                File
                            </span>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.csv"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs dark:border-neutral-700 dark:text-neutral-300 dark:file:bg-neutral-800"
                            />
                            <span className="mt-1 block text-[11px] text-slate-500 dark:text-neutral-500">
                                .xlsx or .csv. The first row must have a heading
                                called Email. First name, Last name, Company and
                                Tags are used when present.
                            </span>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                                Tags for every row
                            </span>
                            <input
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="trade-show, november"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                            />
                        </label>

                        {/* Consent is an explicit choice with the wording next
                            to it, not a default. */}
                        <div className="rounded-lg border border-slate-200 p-3 dark:border-neutral-800">
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                                />
                                <span className="text-xs text-slate-700 dark:text-neutral-300">
                                    These people have agreed to receive marketing
                                    email from us.
                                    <span className="mt-1 block text-[11px] text-slate-500 dark:text-neutral-500">
                                        Leave this unticked to store them without
                                        sending. Campaigns will skip them until
                                        consent is recorded.
                                    </span>
                                </span>
                            </label>

                            {consent && (
                                <label className="mt-2.5 block">
                                    <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-neutral-400">
                                        Where did that consent come from?
                                    </span>
                                    <input
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Sign-up form at the November trade show"
                                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                                    />
                                    <span className="mt-1 block text-[11px] text-slate-500 dark:text-neutral-500">
                                        Stored on every contact in this file, so
                                        it can be shown later if anyone asks.
                                    </span>
                                </label>
                            )}
                        </div>

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
                                    <Upload size={15} />
                                )}
                                Import
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string
    value: number
    tone?: "good" | "bad"
}) {
    return (
        <div className="rounded-lg border border-slate-200 px-2 py-3 dark:border-neutral-800">
            <div
                className={clsx(
                    "text-xl font-semibold",
                    tone === "good"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : tone === "bad"
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-slate-900 dark:text-white"
                )}
            >
                {value}
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">
                {label}
            </div>
        </div>
    )
}
