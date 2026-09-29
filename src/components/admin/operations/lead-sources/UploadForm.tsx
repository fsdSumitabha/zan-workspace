"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import clsx from "clsx"
import { toast } from "sonner"
import { Download, FileSpreadsheet, TriangleAlert, Upload, X } from "lucide-react"
import { LEAD_SOURCE_COLUMNS, LEAD_SOURCE_SHEET_RULES } from "@/config/leadSourceSheet"
import { todayString } from "@/lib/lead-sources/day"
import WriteRegionField, { useWriteRegion } from "@/components/admin/operations/region/WriteRegionField"
import { ApiError, LEAD_SOURCES_API, LEAD_SOURCES_PAGE, send } from "./api"
import AssigneeSelect from "./AssigneeSelect"
import DayChoice from "./DayChoice"

const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"

interface HeaderProblem {
    message: string
    missing?: string[]
    found?: string[]
}

function sizeText(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Upload a cold-calling sheet.
 *
 * The expected headers come from src/config/leadSourceSheet.ts, the same
 * file the server checks against, so this page cannot drift from the check.
 */
export default function UploadForm() {
    const router = useRouter()
    const region = useWriteRegion()

    const [file, setFile] = useState<File | null>(null)
    const [assignee, setAssignee] = useState("")
    const [day, setDay] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [problem, setProblem] = useState<HeaderProblem | null>(null)

    const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
        multiple: false,
        maxSize: LEAD_SOURCE_SHEET_RULES.maxFileMb * 1024 * 1024,
        accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            "text/csv": [".csv"],
            "application/vnd.ms-excel": [".csv"],
        },
        onDrop: (accepted) => {
            setProblem(null)
            setFile(accepted[0] ?? null)
        },
    })

    const rejection = fileRejections[0]?.errors[0]

    const submit = async () => {
        if (!file || uploading) return

        const form = new FormData()
        form.set("file", file)
        form.set("today", todayString())
        if (region.value) form.set("region", region.value)
        if (assignee) form.set("assignedTo", assignee)
        if (day) form.set("allottedDay", day)

        setUploading(true)
        setProblem(null)
        try {
            const result = await send<{ uploadId: string; counts: { imported: number; skipped: number } }>(
                `${LEAD_SOURCES_API}/uploads`,
                "POST",
                form
            )
            toast.success(
                `${result.counts.imported} imported${result.counts.skipped ? `, ${result.counts.skipped} skipped` : ""}.`
            )
            router.push(`${LEAD_SOURCES_PAGE}/uploads/${result.uploadId}`)
        } catch (error) {
            const details = error instanceof ApiError ? (error.details as { missing?: string[]; found?: string[] } | undefined) : undefined
            setProblem({
                message: error instanceof Error ? error.message : "The upload failed.",
                missing: details?.missing,
                found: details?.found,
            })
            setUploading(false)
        }
    }

    return (
        <div className="space-y-3">
            {/* The file */}
            <div className={CARD}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">1. The sheet</h2>
                    <a
                        href={`${LEAD_SOURCES_API}/template`}
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
                                    setProblem(null)
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
                                Drop an <strong>.xlsx</strong> or <strong>.csv</strong> file here, or click to choose one.
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                Up to {LEAD_SOURCE_SHEET_RULES.maxRows.toLocaleString("en-US")} rows and {LEAD_SOURCE_SHEET_RULES.maxFileMb} MB.
                            </p>
                        </>
                    )}
                </div>

                {rejection && (
                    <p className="mt-2 text-sm text-rose-600">
                        {rejection.code === "file-too-large"
                            ? `The file is larger than ${LEAD_SOURCE_SHEET_RULES.maxFileMb} MB.`
                            : rejection.code === "file-invalid-type"
                              ? "Choose an .xlsx or a .csv file. For an old .xls file, save it as .xlsx first."
                              : rejection.message}
                    </p>
                )}

                <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        Header row. Names in red are required. Case, spaces and underscores do not matter.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {LEAD_SOURCE_COLUMNS.map((c) => (
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
                    </div>
                </div>
            </div>

            {/* Who and when */}
            <div className={CARD}>
                <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">2. Who calls them, and when</h2>
                <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                    Both are optional. You can assign and set days later from the list, on any number of rows at once.
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                        <WriteRegionField
                            id="upload-region"
                            value={region.value}
                            onChange={region.setValue}
                            options={region.options}
                            pinned={region.pinned}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="upload-assignee" className="mb-1 block text-sm text-gray-600 dark:text-gray-300">
                            Assign every row to
                        </label>
                        {region.value ? (
                            <AssigneeSelect id="upload-assignee" regions={[region.value]} value={assignee} onChange={setAssignee} />
                        ) : (
                            <p className="text-sm text-neutral-400">Loading...</p>
                        )}
                    </div>
                </div>

                <div className="mt-4">
                    <p className="mb-1.5 text-sm text-gray-600 dark:text-gray-300">Day to call them</p>
                    <DayChoice value={day} onChange={setDay} noneLabel="No day yet" />
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
                            Headers found in the file:{" "}
                            <span className="font-mono">{problem.found.join(", ")}</span>
                        </p>
                    )}
                    <p className="mt-2 pl-6 text-xs">Nothing was saved. Fix the file and upload it again.</p>
                </div>
            )}

            <div className="flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={() => router.push(LEAD_SOURCES_PAGE)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!file || uploading || !region.value}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Checking and importing..." : "Upload and check"}
                </button>
            </div>
        </div>
    )
}
