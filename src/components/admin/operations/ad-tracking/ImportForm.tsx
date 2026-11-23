"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import clsx from "clsx"
import { toast } from "sonner"
import { CheckCircle2, Download, FileSpreadsheet, Info, ScanSearch, TriangleAlert, Upload, X } from "lucide-react"
import { LEAD_IMPORT_COLUMNS, LEAD_IMPORT_RULES } from "@/config/leadImportSheet"
import { AD_PLATFORM, AD_PLATFORM_META, AD_PLATFORMS, type AdPlatform } from "@/constants/adTracking"
import WriteRegionField, { useWriteRegion } from "@/components/admin/operations/region/WriteRegionField"
import type { LeadImportCheck, LeadImportDone } from "@/types/adTracking"
import { AD_TRACKING_API, AD_TRACKING_PAGE, ApiError, CARD, send } from "./api"
import ImportCounts from "./ImportCounts"
import ImportGrid from "./ImportGrid"

interface Problem {
    message: string
    found?: string[]
}

function sizeText(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The columns shown as chips: the Meta export columns and the contact columns. */
const CHIP_KEYS = new Set([
    "leadId", "createdTime", "adId", "adName", "adSetId", "adSetName", "campaignId", "campaignName",
    "formId", "formName", "isOrganic", "channel", "name", "phone", "email", "company", "website",
])

/**
 * Import a sheet of leads.
 *
 * Laid out like the lead source upload, so it reads the same: the file,
 * then where it came from, then the button. One step is added: the file is
 * checked first and nothing is saved until the person presses Import. A
 * lead import creates real leads, so it is worth seeing what will happen.
 *
 * The expected headers come from src/config/leadImportSheet.ts, the same
 * file the server checks against.
 */
export default function ImportForm() {
    const router = useRouter()
    const region = useWriteRegion()

    const [file, setFile] = useState<File | null>(null)
    const [platform, setPlatform] = useState<AdPlatform>(AD_PLATFORM.META)
    const [source, setSource] = useState("")
    const [busy, setBusy] = useState<"check" | "import" | null>(null)
    const [problem, setProblem] = useState<Problem | null>(null)
    const [check, setCheck] = useState<LeadImportCheck | null>(null)

    // Any change to the inputs makes the last check stale.
    const reset = () => {
        setProblem(null)
        setCheck(null)
    }

    const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
        multiple: false,
        maxSize: LEAD_IMPORT_RULES.maxFileMb * 1024 * 1024,
        accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            "text/csv": [".csv"],
            "application/vnd.ms-excel": [".csv"],
            "text/tab-separated-values": [".csv"],
        },
        onDrop: (accepted) => {
            reset()
            setFile(accepted[0] ?? null)
        },
    })

    const rejection = fileRejections[0]?.errors[0]
    const needsSource = platform !== AD_PLATFORM.META

    const formData = (checkOnly: boolean) => {
        const form = new FormData()
        form.set("file", file as File)
        form.set("platform", platform)
        if (needsSource) form.set("source", source.trim())
        if (region.value) form.set("region", region.value)
        if (checkOnly) form.set("check", "1")
        return form
    }

    const fail = (error: unknown) => {
        const details = error instanceof ApiError ? (error.details as { found?: string[] } | undefined) : undefined
        setProblem({
            message: error instanceof Error ? error.message : "The import failed.",
            found: details?.found,
        })
    }

    const runCheck = async () => {
        if (!file || busy) return
        setBusy("check")
        reset()
        try {
            setCheck(await send<LeadImportCheck>(`${AD_TRACKING_API}/imports`, "POST", formData(true)))
        } catch (error) {
            fail(error)
        } finally {
            setBusy(null)
        }
    }

    const runImport = async () => {
        if (!file || busy || !check) return
        setBusy("import")
        setProblem(null)
        try {
            const result = await send<LeadImportDone>(`${AD_TRACKING_API}/imports`, "POST", formData(false))
            const { imported, duplicates, failed, linked } = result.counts
            toast.success(
                `${imported} imported` +
                    (duplicates ? `, ${duplicates} duplicates` : "") +
                    (failed ? `, ${failed} failed` : "") +
                    "." +
                    (linked ? ` ${linked} existing lead${linked === 1 ? "" : "s"} linked to their ads.` : "")
            )
            router.push(`${AD_TRACKING_PAGE}/imports/${result.importId}`)
        } catch (error) {
            fail(error)
            setBusy(null)
        }
    }

    const canCheck = !!file && !busy && !!region.value && (!needsSource || source.trim().length > 0)
    // A file of duplicates only is still worth importing when it links
    // leads to their ads, for example leads the webhook saved.
    const nothingToDo = !!check && check.counts.imported === 0 && check.counts.linked === 0

    return (
        <div className="space-y-3">
            {/* The file */}
            <div className={CARD}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">1. The sheet</h2>
                    <a
                        href={`${AD_TRACKING_API}/template`}
                        download
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                    >
                        <Download className="h-4 w-4" />
                        Download template
                    </a>
                </div>

                <div
                    {...getRootProps()}
                    className={clsx(
                        "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition",
                        isDragActive
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                            : "border-slate-300 hover:border-blue-400 dark:border-neutral-700 dark:hover:border-blue-500/60"
                    )}
                >
                    <input {...getInputProps()} />
                    {file ? (
                        <div className="flex items-center justify-center gap-3">
                            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                            <div className="min-w-0 text-left">
                                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{file.name}</p>
                                <p className="text-xs text-neutral-500">{sizeText(file.size)} · click to choose another file</p>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setFile(null)
                                    reset()
                                }}
                                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
                                aria-label="Remove the file"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <Upload className="mx-auto mb-2 h-6 w-6 text-neutral-500" />
                            <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                Drop the <strong>Meta leads export</strong> (.csv) or an <strong>.xlsx</strong> file here, or click to choose one.
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                Up to {LEAD_IMPORT_RULES.maxRows.toLocaleString("en-US")} rows and {LEAD_IMPORT_RULES.maxFileMb} MB. Upload the export as it is. Opening it in Excel and saving can round the long ids.
                            </p>
                        </>
                    )}
                </div>

                {rejection && (
                    <p className="mt-2 text-sm text-rose-600">
                        {rejection.code === "file-too-large"
                            ? `The file is larger than ${LEAD_IMPORT_RULES.maxFileMb} MB.`
                            : rejection.code === "file-invalid-type"
                              ? "Choose a .csv or an .xlsx file. For an old .xls file, save it as .xlsx first."
                              : rejection.message}
                    </p>
                )}

                <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        Header row. Names in red are required. Case, spaces and underscores do not matter.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {LEAD_IMPORT_COLUMNS.filter((c) => CHIP_KEYS.has(c.key)).map((c) => (
                            <span
                                key={c.key}
                                title={[c.label, c.headers.length > 1 ? `Also accepted: ${c.headers.slice(1).join(", ")}` : ""].filter(Boolean).join(". ")}
                                className={clsx(
                                    "rounded-md px-2 py-0.5 font-mono text-[11px]",
                                    c.required
                                        ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
                                        : "bg-slate-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                                )}
                            >
                                {c.headers[0] ?? c.key}
                            </span>
                        ))}
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[11px] text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30">
                            any_question?
                        </span>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                        Every other column is read as a form question, like the web development and the digital marketing questions. Its answer goes into the lead&apos;s first note, written by you.
                    </p>
                </div>
            </div>

            {/* Where they came from */}
            <div className={CARD}>
                <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">2. Where the leads came from</h2>
                <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                    For a Meta export, each lead is linked to its campaign, ad set, ad and form, and its source is read from the
                    platform column (Facebook or Instagram).
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                        <WriteRegionField
                            id="import-region"
                            value={region.value}
                            onChange={(next) => {
                                region.setValue(next)
                                reset()
                            }}
                            options={region.options}
                            pinned={region.pinned}
                        />
                    </div>
                    <div>
                        <label htmlFor="import-platform" className="mb-1 block text-sm text-gray-600 dark:text-gray-300">
                            Platform
                        </label>
                        <select
                            id="import-platform"
                            value={platform}
                            onChange={(e) => {
                                setPlatform(e.target.value as AdPlatform)
                                reset()
                            }}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                        >
                            {AD_PLATFORMS.map((p) => (
                                <option key={p} value={p} disabled={!AD_PLATFORM_META[p].importable}>
                                    {AD_PLATFORM_META[p].label}
                                    {!AD_PLATFORM_META[p].importable ? " (later)" : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    {needsSource && (
                        <div>
                            <label htmlFor="import-source" className="mb-1 block text-sm text-gray-600 dark:text-gray-300">
                                Source of these leads
                            </label>
                            <input
                                id="import-source"
                                value={source}
                                maxLength={60}
                                onChange={(e) => {
                                    setSource(e.target.value)
                                    setCheck(null)
                                }}
                                placeholder="Trade show, Referral ..."
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                        </div>
                    )}
                </div>
            </div>

            {problem && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
                    <p className="flex items-start gap-2 font-medium">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        {problem.message}
                    </p>
                    {problem.found && problem.found.length > 0 && (
                        <p className="mt-2 pl-6 text-xs">
                            Headers found in the file: <span className="font-mono">{problem.found.join(", ")}</span>
                        </p>
                    )}
                    <p className="mt-2 pl-6 text-xs">Nothing was saved. Fix the file and try again.</p>
                </div>
            )}

            {!check && (
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => router.push(AD_TRACKING_PAGE)}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={runCheck}
                        disabled={!canCheck}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <ScanSearch className="h-4 w-4" />
                        {busy === "check" ? "Checking every row..." : "Check the file"}
                    </button>
                </div>
            )}

            {/* The check. Nothing is saved yet. */}
            {check && (
                <div className="space-y-3">
                    <div className={CARD}>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">3. What will happen</h2>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {check.fileName}
                                    {check.sheetName && check.sheetName !== "CSV" && <> · sheet “{check.sheetName}”</>}
                                    {" · "}header row {check.headerRow}. Nothing is saved until you press Import.
                                </p>
                            </div>
                        </div>

                        <ImportCounts counts={check.counts} newSources={check.newSources} preview />

                        {check.fileNotes.length > 0 && (
                            <ul className="mt-3 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                                {check.fileNotes.map((note) => (
                                    <li key={note} className="flex items-start gap-2">
                                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <ImportGrid columns={check.columns} rows={check.rows} preview />

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setFile(null)
                                reset()
                            }}
                            disabled={!!busy}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                            Choose another file
                        </button>
                        <button
                            type="button"
                            onClick={runImport}
                            disabled={!!busy || nothingToDo}
                            title={nothingToDo ? "No row can be imported, and no lead needs its ad" : undefined}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {busy === "import"
                                ? "Importing..."
                                : check.counts.imported > 0
                                  ? `Import ${check.counts.imported} lead${check.counts.imported === 1 ? "" : "s"}`
                                  : nothingToDo
                                    ? "Nothing to import"
                                    : `Link ${check.counts.linked} lead${check.counts.linked === 1 ? "" : "s"} to their ads`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
