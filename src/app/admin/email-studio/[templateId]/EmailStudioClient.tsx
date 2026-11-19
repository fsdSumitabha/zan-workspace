"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import clsx from "clsx"
import {
    AlertTriangle,
    ArrowLeft,
    Blocks,
    Check,
    Eye,
    Image as ImageIcon,
    Layers,
    Loader2,
    Monitor,
    Redo2,
    Save,
    Smartphone,
    Sliders,
    Undo2,
    Variable,
} from "lucide-react"

import { handleAuthError } from "@/lib/auth/handleAuthError"
import PreviewFrame from "@/components/admin/email/editor/PreviewFrame"
import { useAutosave } from "@/components/admin/email/editor/useAutosave"
import { useUnsavedGuard } from "@/components/admin/email/editor/useUnsavedGuard"
import type { MjmlEditorHandle } from "@/components/admin/email/editor/MjmlEditor"
import type { CompileResponse, EmailEditorPayload } from "@/types/email"

/**
 * GrapesJS touches `window` as soon as it is imported, so the editor can
 * never be part of a server render. This is the only place that loads it.
 */
const MjmlEditor = dynamic(
    () => import("@/components/admin/email/editor/MjmlEditor"),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Loading the editor
            </div>
        ),
    }
)

type LeftTab = "blocks" | "layers" | "assets"
type RightTab = "styles" | "settings"
type Device = "desktop" | "mobile"

const API = "/api/admin/operations/email/templates"

export default function EmailStudioClient({
    templateId,
}: {
    templateId: string
}) {
    const router = useRouter()

    const [payload, setPayload] = useState<EmailEditorPayload | null>(null)
    const [loadError, setLoadError] = useState("")
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [device, setDevice] = useState<Device>("desktop")
    const [leftTab, setLeftTab] = useState<LeftTab>("blocks")
    const [rightTab, setRightTab] = useState<RightTab>("styles")
    const [preview, setPreview] = useState<CompileResponse | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewing, setPreviewing] = useState(false)
    const [panelsOpen, setPanelsOpen] = useState(false)

    const handleRef = useRef<MjmlEditorHandle | null>(null)

    useUnsavedGuard(dirty)

    /* ---------------------------------------------------------------- */
    /* Load                                                              */
    /* ---------------------------------------------------------------- */

    useEffect(() => {
        let cancelled = false

        async function load() {
            const res = await fetch(`${API}/${templateId}`, {
                credentials: "include",
                cache: "no-store",
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setLoadError)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not open the template")
            }

            if (!cancelled) setPayload(json.data as EmailEditorPayload)
        }

        load().catch((e: unknown) =>
            setLoadError(e instanceof Error ? e.message : "Could not open")
        )

        return () => {
            cancelled = true
        }
    }, [templateId, router])

    /* ---------------------------------------------------------------- */
    /* Autosave the draft                                                */
    /* ---------------------------------------------------------------- */

    const getContent = useCallback(
        () => handleRef.current?.getMjml() ?? null,
        []
    )

    const saveDraft = useCallback(
        async (mjml: string) => {
            const res = await fetch(`${API}/${templateId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftMjml: mjml }),
            })
            return res.ok
        },
        [templateId]
    )

    const autosave = useAutosave({
        getContent,
        save: saveDraft,
        enabled: Boolean(payload?.canEdit),
    })

    /**
     * Loading a template is not an edit.
     *
     * GrapesJS fires update events while it parses the MJML it was handed,
     * and the autosave hook starts with no baseline, so without this the
     * first tick would write a draft identical to the saved version. The
     * next person to open the template would then be warned about unsaved
     * work that does not exist.
     *
     * The delay lets the parse settle; GrapesJS emits those events over
     * several frames rather than one. Anything the designer does after that
     * is a real change and marks the template dirty as normal.
     */
    const settled = useRef(false)

    const handleEditorReady = useCallback(
        (handle: MjmlEditorHandle) => {
            handleRef.current = handle

            settled.current = false
            window.setTimeout(() => {
                settled.current = true
                setDirty(false)
                autosave.markSaved()
            }, 600)
        },
        [autosave]
    )

    const handleEditorChange = useCallback(() => {
        if (!settled.current) return
        setDirty(true)
    }, [])

    /* ---------------------------------------------------------------- */
    /* Save a version                                                    */
    /* ---------------------------------------------------------------- */

    async function saveVersion() {
        const mjml = handleRef.current?.getMjml()
        if (!mjml) return

        setSaving(true)
        try {
            const res = await fetch(`${API}/${templateId}/versions`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mjml }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setLoadError)) return

            if (!res.ok || !json?.success) {
                // The server compiled and refused. Its message names the
                // line and the tag, so show it as-is.
                throw new Error(json?.message || "Could not save")
            }

            const warnings: string[] = json.data?.warnings ?? []
            const savedVersion: number | undefined = json.data?.version?.version

            setDirty(false)
            autosave.markSaved()

            // Move the header on to the version we just wrote. Without this
            // it keeps showing the number from page load, so saving three
            // times in a row still reads "Version 1 saved".
            if (savedVersion) {
                setPayload((p) =>
                    p
                        ? {
                              ...p,
                              fromDraft: false,
                              template: {
                                  ...p.template,
                                  currentVersion: savedVersion,
                                  versionCount: p.template.versionCount + 1,
                                  hasDraft: false,
                              },
                          }
                        : p
                )
            }

            if (warnings.length > 0) {
                toast.warning(`Saved, with ${warnings.length} warning(s).`, {
                    description: warnings[0],
                })
            } else {
                toast.success(`Saved as version ${savedVersion}.`)
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not save")
        } finally {
            setSaving(false)
        }
    }

    /* ---------------------------------------------------------------- */
    /* Preview                                                           */
    /* ---------------------------------------------------------------- */

    async function openPreview() {
        const mjml = handleRef.current?.getMjml()
        if (!mjml) return

        setPreviewing(true)
        try {
            const res = await fetch(`${API}/compile`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mjml }),
            })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setLoadError)) return

            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Could not build the preview")
            }

            setPreview(json.data as CompileResponse)
            setPreviewOpen(true)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not preview")
        } finally {
            setPreviewing(false)
        }
    }

    /* ---------------------------------------------------------------- */
    /* Leaving                                                           */
    /* ---------------------------------------------------------------- */

    function goBack() {
        // beforeunload does not fire on an in-app route change, so the
        // confirm has to happen here.
        if (
            dirty &&
            !window.confirm(
                "You have changes that are not saved as a version. Leave anyway? " +
                "Your draft is kept and will be here when you come back."
            )
        ) {
            return
        }
        router.push("/admin/operations/email/templates")
    }

    /* ---------------------------------------------------------------- */
    /* Render                                                            */
    /* ---------------------------------------------------------------- */

    if (loadError) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
                    <AlertTriangle
                        size={22}
                        className="mx-auto text-amber-500"
                    />
                    <h1 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        Cannot open this template
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                        {loadError}
                    </p>
                    <button
                        type="button"
                        onClick={() =>
                            router.push("/admin/operations/email/templates")
                        }
                        className="mt-4 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                        Back to templates
                    </button>
                </div>
            </div>
        )
    }

    if (!payload) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Opening the template
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col">
            {/* ---------------- Toolbar ---------------- */}
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-900">
                <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                    <ArrowLeft size={16} />
                    <span className="hidden sm:inline">Templates</span>
                </button>

                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {payload.template.name}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-neutral-500">
                        <SaveState
                            dirty={dirty}
                            state={autosave.state}
                            lastSavedAt={autosave.lastSavedAt}
                            version={payload.template.currentVersion}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <IconButton
                        title="Undo"
                        onClick={() => handleRef.current?.undo()}
                    >
                        <Undo2 size={16} />
                    </IconButton>
                    <IconButton
                        title="Redo"
                        onClick={() => handleRef.current?.redo()}
                    >
                        <Redo2 size={16} />
                    </IconButton>

                    <div className="mx-1 hidden h-5 w-px bg-slate-200 dark:bg-neutral-700 sm:block" />

                    <div className="hidden items-center rounded-lg border border-slate-200 p-0.5 dark:border-neutral-700 sm:flex">
                        <DeviceButton
                            active={device === "desktop"}
                            onClick={() => {
                                setDevice("desktop")
                                handleRef.current?.setDevice("desktop")
                            }}
                            title="Desktop"
                        >
                            <Monitor size={15} />
                        </DeviceButton>
                        <DeviceButton
                            active={device === "mobile"}
                            onClick={() => {
                                setDevice("mobile")
                                handleRef.current?.setDevice("mobile")
                            }}
                            title="Mobile"
                        >
                            <Smartphone size={15} />
                        </DeviceButton>
                    </div>

                    <IconButton
                        title="Panels"
                        className="lg:hidden"
                        onClick={() => setPanelsOpen((o) => !o)}
                    >
                        <Sliders size={16} />
                    </IconButton>

                    <button
                        type="button"
                        onClick={openPreview}
                        disabled={previewing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                        {previewing ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <Eye size={15} />
                        )}
                        <span className="hidden sm:inline">Preview</span>
                    </button>

                    {payload.canEdit && (
                        <button
                            type="button"
                            onClick={saveVersion}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {saving ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Save size={15} />
                            )}
                            Save
                        </button>
                    )}
                </div>
            </header>

            {payload.fromDraft && (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    This is an unsaved draft from a previous session. Press Save to
                    make it version {payload.template.currentVersion + 1}.
                </div>
            )}

            {/* ---------------- Workspace ---------------- */}
            <div className="flex min-h-0 flex-1">
                {/* Left panel */}
                <aside
                    className={clsx(
                        "w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
                        "lg:flex",
                        panelsOpen
                            ? "absolute inset-y-14 left-0 z-20 flex shadow-xl"
                            : "hidden"
                    )}
                >
                    <TabBar
                        tabs={[
                            { id: "blocks", label: "Blocks", icon: <Blocks size={14} /> },
                            { id: "layers", label: "Layers", icon: <Layers size={14} /> },
                            { id: "assets", label: "Images", icon: <ImageIcon size={14} /> },
                        ]}
                        active={leftTab}
                        onChange={(t) => setLeftTab(t as LeftTab)}
                    />

                    {/* All three mount always. GrapesJS appends its managers
                        into these nodes once, at init, so a node that is
                        unmounted on a tab switch would never come back. They
                        are hidden with CSS instead. */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <div id="gjs-blocks" hidden={leftTab !== "blocks"} />
                        <div id="gjs-layers" hidden={leftTab !== "layers"} />
                        <div hidden={leftTab !== "assets"}>
                            <AssetList
                                assets={payload.assets}
                                onPick={(url) =>
                                    handleRef.current?.insert(
                                        `<mj-image src="${url}" />`
                                    )
                                }
                            />
                        </div>
                    </div>

                    <MergeTokenMenu
                        tokens={payload.mergeTokens}
                        onInsert={(key) =>
                            handleRef.current?.insert(
                                `<mj-text>{{${key}}}</mj-text>`
                            )
                        }
                    />
                </aside>

                {/* Canvas */}
                <main className="relative min-w-0 flex-1">
                    <MjmlEditor
                        payload={payload}
                        onReady={handleEditorReady}
                        onChange={handleEditorChange}
                    />
                </main>

                {/* Right panel */}
                <aside
                    className={clsx(
                        "w-64 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
                        "lg:flex",
                        panelsOpen
                            ? "absolute inset-y-14 right-0 z-20 flex shadow-xl"
                            : "hidden"
                    )}
                >
                    <TabBar
                        tabs={[
                            { id: "styles", label: "Style", icon: <Sliders size={14} /> },
                            { id: "settings", label: "Settings", icon: <Variable size={14} /> },
                        ]}
                        active={rightTab}
                        onChange={(t) => setRightTab(t as RightTab)}
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <div hidden={rightTab !== "styles"}>
                            <div id="gjs-selectors" />
                            <div id="gjs-styles" />
                        </div>
                        <div id="gjs-traits" hidden={rightTab !== "settings"} />
                    </div>
                </aside>
            </div>

            {/* ---------------- Preview overlay ---------------- */}
            {previewOpen && preview && (
                <PreviewOverlay
                    preview={preview}
                    device={device}
                    onDevice={setDevice}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function SaveState({
    dirty,
    state,
    lastSavedAt,
    version,
}: {
    dirty: boolean
    state: string
    lastSavedAt: Date | null
    version: number
}) {
    if (state === "saving") {
        return (
            <span className="flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" />
                Saving draft
            </span>
        )
    }

    if (state === "error") {
        return (
            <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={11} />
                Draft not saved
            </span>
        )
    }

    if (dirty) {
        return (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                Unsaved changes
                {lastSavedAt && (
                    <span className="text-slate-400">
                        · draft kept {lastSavedAt.toLocaleTimeString()}
                    </span>
                )}
            </span>
        )
    }

    return (
        <span className="flex items-center gap-1">
            <Check size={11} className="text-emerald-500" />
            {version > 0 ? `Version ${version} saved` : "Not saved yet"}
        </span>
    )
}

function IconButton({
    title,
    onClick,
    children,
    className,
}: {
    title: string
    onClick: () => void
    children: React.ReactNode
    className?: string
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={clsx(
                "rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
                className
            )}
        >
            {children}
        </button>
    )
}

function DeviceButton({
    active,
    onClick,
    title,
    children,
}: {
    active: boolean
    onClick: () => void
    title: string
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            onClick={onClick}
            className={clsx(
                "rounded-md p-1.5 transition",
                active
                    ? "bg-emerald-600 text-white"
                    : "text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            )}
        >
            {children}
        </button>
    )
}

function TabBar({
    tabs,
    active,
    onChange,
}: {
    tabs: Array<{ id: string; label: string; icon: React.ReactNode }>
    active: string
    onChange: (id: string) => void
}) {
    return (
        <div className="flex shrink-0 border-b border-slate-200 dark:border-neutral-800">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={clsx(
                        "flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition",
                        active === tab.id
                            ? "border-b-2 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                            : "border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    )}
                >
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
    )
}

function AssetList({
    assets,
    onPick,
}: {
    assets: EmailEditorPayload["assets"]
    onPick: (url: string) => void
}) {
    if (assets.length === 0) {
        return (
            <p className="p-4 text-xs text-slate-500 dark:text-neutral-500">
                No images yet. Upload them from Email Marketing, Assets.
            </p>
        )
    }

    return (
        <div className="grid grid-cols-2 gap-2 p-2">
            {assets.map((asset) => (
                <button
                    key={asset._id}
                    type="button"
                    title={asset.name}
                    onClick={() => onPick(asset.url)}
                    className="overflow-hidden rounded-lg border border-slate-200 transition hover:border-emerald-500 dark:border-neutral-700"
                >
                    {/* A plain img: these are arbitrary ImageKit URLs in a
                        panel, not page content that needs optimising. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={asset.url}
                        alt={asset.altTextDefault || asset.name}
                        className="h-16 w-full bg-slate-100 object-cover dark:bg-neutral-800"
                        loading="lazy"
                    />
                    <span className="block truncate px-1.5 py-1 text-[10px] text-slate-600 dark:text-neutral-400">
                        {asset.name}
                    </span>
                </button>
            ))}
        </div>
    )
}

function MergeTokenMenu({
    tokens,
    onInsert,
}: {
    tokens: EmailEditorPayload["mergeTokens"]
    onInsert: (key: string) => void
}) {
    const [open, setOpen] = useState(false)

    return (
        <div className="shrink-0 border-t border-slate-200 dark:border-neutral-800">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
                <Variable size={13} />
                Merge fields
                <span className="ml-auto text-slate-400">{open ? "−" : "+"}</span>
            </button>

            {open && (
                <div className="max-h-56 overflow-y-auto px-2 pb-2">
                    {tokens.map((token) => (
                        <button
                            key={token.key}
                            type="button"
                            title={token.description}
                            onClick={() => onInsert(token.key)}
                            className="block w-full rounded-md px-2 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800"
                        >
                            <span className="block text-[11px] font-medium text-slate-800 dark:text-neutral-200">
                                {token.label}
                            </span>
                            <span className="block font-mono text-[10px] text-slate-500 dark:text-neutral-500">
                                {`{{${token.key}}}`}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function PreviewOverlay({
    preview,
    device,
    onDevice,
    onClose,
}: {
    preview: CompileResponse
    device: Device
    onDevice: (d: Device) => void
    onClose: () => void
}) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-black/50">
            <div className="flex h-12 shrink-0 items-center gap-2 bg-white px-3 dark:bg-neutral-900">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Preview
                </span>
                <span className="text-xs text-slate-500 dark:text-neutral-500">
                    {Math.round(preview.htmlBytes / 1024)} KB · sample values shown
                </span>

                <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-neutral-700">
                        <DeviceButton
                            active={device === "desktop"}
                            onClick={() => onDevice("desktop")}
                            title="Desktop"
                        >
                            <Monitor size={15} />
                        </DeviceButton>
                        <DeviceButton
                            active={device === "mobile"}
                            onClick={() => onDevice("mobile")}
                            title="Mobile"
                        >
                            <Smartphone size={15} />
                        </DeviceButton>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                        Close
                    </button>
                </div>
            </div>

            {(preview.warnings.length > 0 || preview.unknownTokens.length > 0) && (
                <div className="shrink-0 space-y-1 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                    {preview.unknownTokens.length > 0 && (
                        <p>
                            Unknown merge fields, which will print as written:{" "}
                            {preview.unknownTokens.map((t) => `{{${t}}}`).join(", ")}
                        </p>
                    )}
                    {preview.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                    ))}
                </div>
            )}

            <PreviewFrame
                html={preview.html}
                device={device}
                className="min-h-0 flex-1"
            />
        </div>
    )
}
