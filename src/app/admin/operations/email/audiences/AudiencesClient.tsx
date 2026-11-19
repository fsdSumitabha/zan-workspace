"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, Save, Target, Trash2, Users, X } from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import RuleBuilder, {
    type BuilderOptions,
    type RuleState,
} from "@/components/admin/email/audience/RuleBuilder"
import ExclusionBreakdown from "@/components/admin/email/audience/ExclusionBreakdown"
import type { AudiencePreviewView, EmailAudienceRow } from "@/types/email"

const API = "/api/admin/operations/email/audiences"

export default function AudiencesClient() {
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState("")
    const [rows, setRows] = useState<EmailAudienceRow[]>([])
    const [options, setOptions] = useState<BuilderOptions>({
        leadSources: [],
        assignees: [],
        contactTags: [],
    })

    // The editor. null means the list is showing.
    const [editing, setEditing] = useState<{
        id: string | null
        name: string
        description: string
        rules: RuleState
    } | null>(null)

    const [preview, setPreview] = useState<AudiencePreviewView | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [saving, setSaving] = useState(false)

    /* ---------------------------------------------------------------- */

    const load = useCallback(async () => {
        const [listRes, optionsRes] = await Promise.all([
            fetch(API, { credentials: "include", cache: "no-store" }),
            fetch(`${API}/options`, { credentials: "include", cache: "no-store" }),
        ])

        const listJson = await listRes.json().catch(() => null)
        if (handleAuthError(listRes, listJson, router, setForbidden)) return

        if (!listRes.ok || !listJson?.success) {
            throw new Error(listJson?.message || "Failed to load the audiences")
        }

        setRows(listJson.data as EmailAudienceRow[])

        const optionsJson = await optionsRes.json().catch(() => null)
        if (optionsRes.ok && optionsJson?.success) {
            setOptions(optionsJson.data as BuilderOptions)
        }
    }, [router])

    useEffect(() => {
        load()
            .catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Failed to load")
            )
            .finally(() => setLoading(false))
    }, [load])

    /* ---- Live count, debounced ---- */

    // Tracks the newest request so a slow early reply cannot overwrite a
    // fast later one and show a count for rules that are no longer set.
    const requestId = useRef(0)

    useEffect(() => {
        if (!editing) return

        const id = ++requestId.current
        setPreviewing(true)

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API}/preview`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rules: editing.rules }),
                })
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
        }, 400)

        return () => clearTimeout(timer)
    }, [editing, router])

    /* ---------------------------------------------------------------- */

    async function save() {
        if (!editing) return

        if (!editing.name.trim()) {
            toast.error("Give the audience a name.")
            return
        }

        setSaving(true)
        try {
            const res = await fetch(
                editing.id ? `${API}/${editing.id}` : API,
                {
                    method: editing.id ? "PATCH" : "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: editing.name.trim(),
                        description: editing.description,
                        rules: editing.rules,
                    }),
                }
            )
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setForbidden)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not save")
            }

            toast.success(editing.id ? "Audience updated." : "Audience saved.")
            setEditing(null)
            setPreview(null)
            await load()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not save")
        } finally {
            setSaving(false)
        }
    }

    async function remove(row: EmailAudienceRow) {
        if (!window.confirm(`Delete the audience "${row.name}"?`)) return

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

            toast.success("Audience deleted.")
            setRows((r) => r.filter((x) => x._id !== row._id))
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not delete")
        }
    }

    if (forbidden) return <AccessDenied message={forbidden} />

    /* ---------------------------------------------------------------- */
    /* Editor                                                            */
    /* ---------------------------------------------------------------- */

    if (editing) {
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {editing.id ? "Edit audience" : "New audience"}
                        </h1>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                            Combine CRM records without writing a query. The count
                            updates as you change the rules.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setEditing(null)
                                setPreview(null)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                            <X size={15} />
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {saving ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Save size={15} />
                            )}
                            Save audience
                        </button>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                    <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                                    Name
                                </span>
                                <input
                                    value={editing.name}
                                    onChange={(e) =>
                                        setEditing({ ...editing, name: e.target.value })
                                    }
                                    placeholder="Warm leads, November"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                                />
                            </label>
                        </div>

                        <RuleBuilder
                            rules={editing.rules}
                            options={options}
                            onChange={(rules) => setEditing({ ...editing, rules })}
                        />
                    </div>

                    <div className="lg:sticky lg:top-4 lg:self-start">
                        <ExclusionBreakdown
                            preview={preview}
                            loading={previewing}
                        />
                    </div>
                </div>
            </div>
        )
    }

    /* ---------------------------------------------------------------- */
    /* List                                                              */
    /* ---------------------------------------------------------------- */

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Audiences
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                        Saved groups of recipients. A campaign recounts when it
                        starts, so these numbers are a guide, not a promise.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setEditing({
                            id: null,
                            name: "",
                            description: "",
                            rules: { leads: { all: false, status: [] } },
                        })
                        setPreview(null)
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                    <Plus size={15} />
                    New audience
                </button>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                        />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500">
                        <Target size={20} />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        No audiences yet
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-neutral-400">
                        An audience picks leads, clients and imported contacts by
                        the things you already record about them.
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {rows.map((row) => (
                        <li
                            key={row._id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-emerald-800"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                    {row.name}
                                </div>
                                {row.description && (
                                    <div className="truncate text-xs text-slate-500 dark:text-neutral-400">
                                        {row.description}
                                    </div>
                                )}
                            </div>

                            <div className="text-right">
                                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                                    <Users size={13} className="text-slate-400" />
                                    {row.lastCount?.toLocaleString() ?? "—"}
                                </div>
                                <div className="text-[11px] text-slate-400 dark:text-neutral-600">
                                    {row.lastCountedAt
                                        ? `counted ${new Date(row.lastCountedAt).toLocaleDateString()}`
                                        : "not counted"}
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setEditing({
                                            id: row._id,
                                            name: row.name,
                                            description: row.description,
                                            rules: row.rules as RuleState,
                                        })
                                    }
                                    className="rounded-md px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => remove(row)}
                                    className="rounded-md px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
