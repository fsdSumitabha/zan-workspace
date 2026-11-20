"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import {
    AlertTriangle,
    FileCode2,
    FileText,
    Loader2,
    Pencil,
    Plus,
    Search,
    Trash2,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import Dialog, {
    BUTTON_PRIMARY,
    BUTTON_QUIET,
    FIELD,
} from "@/components/admin/operations/lead-sources/Dialog"
import {
    TEMPLATE_CATEGORIES,
    TEMPLATE_CATEGORY,
    TEMPLATE_CATEGORY_META,
    type TemplateCategory,
} from "@/constants/emailStatus"
import type { EmailTemplateRow } from "@/types/email"

const API = "/api/admin/operations/email/templates"

/** The create route reads at most this much MJML. Keep the two in step. */
const MAX_MJML_BYTES = 512 * 1024

export default function TemplatesClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<EmailTemplateRow[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [search, setSearch] = useState("")
    const [category, setCategory] = useState<TemplateCategory | null>(null)
    const [creating, setCreating] = useState(false)

    // The new-template dialog. It was window.prompt, which cannot say what
    // a name is for, cannot offer the category, and looks like a browser
    // warning rather than part of the app.
    const [newOpen, setNewOpen] = useState(false)
    const [newName, setNewName] = useState("")
    const [newCategory, setNewCategory] = useState<TemplateCategory>(
        TEMPLATE_CATEGORY.GENERAL
    )

    // An uploaded .mjml file, read in the browser. The create route has
    // always accepted `mjml` in the body; there was no way to send one.
    const [file, setFile] = useState<{ name: string; mjml: string } | null>(
        null
    )
    const [fileProblem, setFileProblem] = useState("")
    const [fileWarnings, setFileWarnings] = useState<string[]>([])

    const load = useCallback(
        async (q: string, cat: TemplateCategory | null) => {
            const url = new URL(API, window.location.origin)
            if (q) url.searchParams.set("search", q)
            if (cat !== null) url.searchParams.set("category", String(cat))

            const res = await fetch(url, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to load the templates")
            }

            setRows(json.data as EmailTemplateRow[])
            setCounts(json.counts ?? {})
        },
        [router]
    )

    // Debounced, so typing does not fire a query per keystroke.
    useEffect(() => {
        const t = setTimeout(() => {
            load(search, category)
                .catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Failed to load")
                )
                .finally(() => setLoading(false))
        }, 300)

        return () => clearTimeout(t)
    }, [search, category, load])

    function openCreate() {
        setNewName("")
        setNewCategory(TEMPLATE_CATEGORY.GENERAL)
        setFile(null)
        setFileProblem("")
        setFileWarnings([])
        setNewOpen(true)
    }

    /**
     * Reads a .mjml file the person picked.
     *
     * The file is read here and sent as text. Nothing is uploaded: the
     * server compiles the MJML and stores the result, so there is no file
     * to keep and no upload endpoint to guard.
     *
     * Two checks happen before the server sees it. Both are about what the
     * Zan starter gives you for free and an imported file may not have.
     */
    async function readMjmlFile(picked: File | null) {
        setFileProblem("")
        setFileWarnings([])

        if (!picked) {
            setFile(null)
            return
        }

        // The create route refuses anything over 512 KB. Say so here
        // rather than after an upload that was never going to work.
        if (picked.size > MAX_MJML_BYTES) {
            setFile(null)
            setFileProblem(
                `That file is ${Math.round(picked.size / 1024)} KB. The limit is ` +
                    `${MAX_MJML_BYTES / 1024} KB.`
            )
            return
        }

        const text = await picked.text()

        if (!text.includes("<mjml")) {
            setFile(null)
            setFileProblem(
                "That does not look like MJML. The file should have an <mjml> " +
                    "tag at the top. A plain HTML email will not compile."
            )
            return
        }

        const warnings: string[] = []
        if (!text.includes("{{unsubscribe_url}}")) {
            warnings.push(
                "No {{unsubscribe_url}} in the file, so there will be no " +
                    "unsubscribe link in the email body. The one-click " +
                    "unsubscribe header is still sent, but the law wants a " +
                    "visible link. Add one in the editor."
            )
        }
        if (!text.includes("{{postal_address}}")) {
            warnings.push(
                "No {{postal_address}} in the file. Marketing email has to " +
                    "carry a postal address. Add the token in the editor and " +
                    "the sender identity fills it in."
            )
        }

        setFile({ name: picked.name, mjml: text })
        setFileWarnings(warnings)

        // A name saves one step, and the filename is usually the right one.
        setNewName((current) =>
            current.trim() === ""
                ? picked.name.replace(/\.mjml$/i, "").replace(/[-_]+/g, " ")
                : current
        )
    }

    async function createTemplate() {
        const name = newName.trim()
        if (!name || creating) return

        setCreating(true)
        try {
            const res = await fetch(API, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    category: newCategory,
                    // Left out when nobody picked a file, so the route
                    // falls back to the Zan starter.
                    ...(file ? { mjml: file.mjml } : {}),
                }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not create the template")
            }

            const created = json.data as EmailTemplateRow
            setNewOpen(false)
            toast.success("Template created.")
            router.push(`/admin/email-studio/${created._id}`)
        } catch (e: unknown) {
            // The dialog stays open, with the name still in it. A duplicate
            // name is the common failure, and retyping it would be rude.
            toast.error(e instanceof Error ? e.message : "Could not create")
        } finally {
            setCreating(false)
        }
    }

    async function remove(row: EmailTemplateRow) {
        if (
            !window.confirm(
                `Delete "${row.name}"? This cannot be undone from the app.`
            )
        ) {
            return
        }

        try {
            const res = await fetch(`${API}/${row._id}`, {
                method: "DELETE",
                credentials: "include",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not delete")
            }

            toast.success("Template deleted.")
            setRows((r) => r.filter((x) => x._id !== row._id))
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not delete")
        }
    }

    if (forbidden) return <AccessDenied message={forbidden} />

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Templates
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        The designs campaigns are built from. Editing one creates a
                        new version, so campaigns already sent are not changed.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                    <Plus size={15} />
                    New template
                </button>
            </div>

            <Dialog
                open={newOpen}
                onClose={() => !creating && setNewOpen(false)}
                title="New template"
                description={
                    file
                        ? `It starts from ${file.name}. The editor opens next.`
                        : "It starts from the Zan design, with a footer and an unsubscribe link already in place. The editor opens next."
                }
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setNewOpen(false)}
                            disabled={creating}
                            className={BUTTON_QUIET}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={createTemplate}
                            disabled={creating || newName.trim() === ""}
                            className={BUTTON_PRIMARY}
                        >
                            {creating && (
                                <Loader2 size={15} className="animate-spin" />
                            )}
                            {creating ? "Creating..." : "Create and open"}
                        </button>
                    </>
                }
            >
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Name
                    </span>
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") createTemplate()
                        }}
                        maxLength={200}
                        placeholder="November newsletter"
                        className={FIELD}
                    />
                    <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                        Only your team sees this. It is not the subject line.
                    </span>
                </label>

                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Category
                    </span>
                    <select
                        value={newCategory}
                        onChange={(e) =>
                            setNewCategory(
                                Number(e.target.value) as TemplateCategory
                            )
                        }
                        className={FIELD}
                    >
                        {TEMPLATE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {TEMPLATE_CATEGORY_META[c].label}
                            </option>
                        ))}
                    </select>
                    <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                        Only for filtering the library. It changes nothing in
                        the email.
                    </span>
                </label>

                <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-neutral-700">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Start from an MJML file
                        </span>
                        {file && (
                            <button
                                type="button"
                                onClick={() => readMjmlFile(null)}
                                className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                            >
                                Remove
                            </button>
                        )}
                    </div>

                    {file ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-100">
                            <FileCode2 size={15} className="shrink-0" />
                            <span className="truncate">{file.name}</span>
                        </p>
                    ) : (
                        <input
                            type="file"
                            accept=".mjml,text/plain"
                            onChange={(e) =>
                                readMjmlFile(e.target.files?.[0] ?? null)
                            }
                            className="mt-2 block w-full text-xs text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-slate-200 dark:text-neutral-400 dark:file:bg-neutral-800 dark:file:text-neutral-200 dark:hover:file:bg-neutral-700"
                        />
                    )}

                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        Optional. Without one it starts from the Zan design,
                        which already has the footer, the unsubscribe link and
                        the postal address in it.
                    </p>

                    {fileProblem && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <span>{fileProblem}</span>
                        </p>
                    )}

                    {fileWarnings.map((w) => (
                        <p
                            key={w}
                            className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                        >
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <span>{w}</span>
                        </p>
                    ))}
                </div>
            </Dialog>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="relative min-w-[180px] flex-1">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search templates"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                </div>

                <div className="flex w-0 min-w-full gap-1 overflow-x-auto sm:w-auto sm:min-w-0">
                    <Chip
                        active={category === null}
                        label="All"
                        onClick={() => setCategory(null)}
                    />
                    {TEMPLATE_CATEGORIES.map((c) => (
                        <Chip
                            key={c}
                            active={category === c}
                            label={TEMPLATE_CATEGORY_META[c].label}
                            count={counts[String(c)]}
                            onClick={() => setCategory(c)}
                        />
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                        />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <FileText size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        {search || category !== null
                            ? "Nothing matches that"
                            : "No templates yet"}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        {search || category !== null
                            ? "Try a different search or category."
                            : "A new template starts from the Zan design, with a footer and an unsubscribe link already in place."}
                    </p>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((row) => (
                        <article
                            key={row._id}
                            className="group flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-emerald-700"
                        >
                            <Link
                                href={`/admin/email-studio/${row._id}`}
                                className="flex flex-1 flex-col p-4"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                        {row.name}
                                    </h3>
                                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-neutral-800 dark:text-neutral-400">
                                        {TEMPLATE_CATEGORY_META[
                                            row.category as TemplateCategory
                                        ]?.label ??
                                            TEMPLATE_CATEGORY_META[
                                                TEMPLATE_CATEGORY.GENERAL
                                            ].label}
                                    </span>
                                </div>

                                {row.description && (
                                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-neutral-400">
                                        {row.description}
                                    </p>
                                )}

                                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[11px] text-slate-500 dark:text-neutral-500">
                                    <span>
                                        {row.currentVersion > 0
                                            ? `Version ${row.currentVersion}`
                                            : "Not saved yet"}
                                    </span>
                                    {row.versionCount > 1 && (
                                        <span>· {row.versionCount} versions</span>
                                    )}
                                    {row.hasDraft && (
                                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                            Unsaved draft
                                        </span>
                                    )}
                                </div>
                            </Link>

                            <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-2 py-1.5 dark:border-neutral-800">
                                <Link
                                    href={`/admin/email-studio/${row._id}`}
                                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                >
                                    <Pencil size={13} />
                                    Edit
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => remove(row)}
                                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                    <Trash2 size={13} />
                                    Delete
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
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
                        active
                            ? "bg-white/20"
                            : "bg-slate-200 dark:bg-neutral-700"
                    )}
                >
                    {count}
                </span>
            )}
        </button>
    )
}
