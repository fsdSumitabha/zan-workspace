"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import clsx from "clsx"
import { ArrowLeft, ArrowRight, Download, Info, TriangleAlert } from "lucide-react"
import { AD_KIND_META, LEAD_IMPORT_STATUS, type AdKind } from "@/constants/adTracking"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { RegionBadge } from "@/components/admin/operations/region/RegionBadge"
import type { LeadImportBreakdownView, LeadImportReport } from "@/types/adTracking"
import { AD_TRACKING_API, AD_TRACKING_PAGE, CARD, formatDateTime, recordHref } from "./api"
import { ExternalId, PlatformBadge } from "./bits"
import ImportCounts from "./ImportCounts"
import ImportGrid from "./ImportGrid"

const LEVELS: Array<{ key: keyof LeadImportReport["breakdown"]; kind: AdKind }> = [
    { key: "campaigns", kind: "campaign" },
    { key: "adSets", kind: "adSet" },
    { key: "ads", kind: "ad" },
    { key: "forms", kind: "form" },
]

/**
 * One import: who, when, the counts, how many leads came from each
 * campaign, ad set, ad and form, and every row of the file.
 */
export default function ImportReport() {
    const params = useParams()
    const importId = params.importId as string
    const router = useRouter()
    const [report, setReport] = useState<LeadImportReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)
    const [level, setLevel] = useState<keyof LeadImportReport["breakdown"]>("campaigns")

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`${AD_TRACKING_API}/imports/${importId}`, { cache: "no-store" })
                const json = await res.json().catch(() => null)
                if (handleAuthError(res, json, router, setAccessError)) return
                setReport(json?.success ? json.data : null)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [importId, router])

    if (!loading && accessError) return <AccessDenied message={accessError} />

    if (loading) {
        return (
            <div className="w-0 min-w-full space-y-3">
                <div className={`${CARD} h-32 animate-pulse`} />
                <div className={`${CARD} h-80 animate-pulse`} />
            </div>
        )
    }

    if (!report) {
        return <div className={`${CARD} py-12 text-center text-sm text-neutral-500`}>Import not found.</div>
    }

    const download = `${AD_TRACKING_API}/imports/${report._id}/download`
    const rows = report.breakdown[level]
    const currentKind = LEVELS.find((l) => l.key === level)!.kind

    return (
        <div className="w-0 min-w-full space-y-3 pb-10">
            <Link
                href={`${AD_TRACKING_PAGE}/imports`}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                Lead imports
            </Link>

            <div className={CARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">{report.fileName}</h1>
                            <RegionBadge code={report.region} />
                            <PlatformBadge platform={report.platform} />
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                            Imported by {report.uploadedBy?.name || "someone"} · {formatDateTime(report.createdAt)}
                            {report.sheetName && report.sheetName !== "CSV" && <> · sheet “{report.sheetName}”</>}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <a
                            href={download}
                            download
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
                        >
                            <Download className="h-4 w-4" />
                            Download report
                        </a>
                        {report.counts.failed > 0 && (
                            <a
                                href={`${download}?only=failed`}
                                download
                                title="Fix these rows in Excel, then import the same file again"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            >
                                <Download className="h-4 w-4" />
                                Failed rows only
                            </a>
                        )}
                    </div>
                </div>

                <div className="mt-4">
                    <ImportCounts counts={report.counts} newSources={report.newSources} />
                </div>

                {report.status === LEAD_IMPORT_STATUS.FAILED && (
                    <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
                        <TriangleAlert className="h-4 w-4" />
                        {report.error || "This import failed. Nothing was imported."}
                    </p>
                )}

                {report.fileNotes.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                        {report.fileNotes.map((note) => (
                            <li key={note} className="flex items-start gap-2">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                {note}
                            </li>
                        ))}
                    </ul>
                )}

                {report.counts.imported > 0 && (
                    <Link
                        href={`/admin/operations/leads?import=${report._id}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                        Open the {report.counts.imported} imported leads
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                )}
            </div>

            {/* Where the leads of this file came from */}
            {LEVELS.some((l) => report.breakdown[l.key].length > 0) && (
                <div className={CARD}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Where these leads came from</h2>
                        <div className="flex flex-wrap gap-1.5">
                            {LEVELS.map((l) => (
                                <button
                                    key={l.key}
                                    type="button"
                                    onClick={() => setLevel(l.key)}
                                    className={clsx(
                                        "rounded-full border px-3 py-1 text-xs font-medium transition",
                                        level === l.key
                                            ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                                            : "border-slate-300 text-neutral-700 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                    )}
                                >
                                    {AD_KIND_META[l.kind].plural}{" "}
                                    <span className="tabular-nums opacity-70">{report.breakdown[l.key].length}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <BreakdownTable kind={currentKind} rows={rows} />
                </div>
            )}

            {report.rows.length > 0 && <ImportGrid columns={report.columns} rows={report.rows} />}
        </div>
    )
}

function BreakdownTable({ kind, rows }: { kind: AdKind; rows: LeadImportBreakdownView[] }) {
    if (rows.length === 0) {
        return <p className="py-4 text-sm text-neutral-500">No {AD_KIND_META[kind].plural.toLowerCase()} in this file.</p>
    }
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                        <th className="px-3 py-2 font-medium">{AD_KIND_META[kind].label}</th>
                        <th className="px-3 py-2 text-right font-medium">Imported</th>
                        <th className="px-3 py-2 text-right font-medium">Duplicates</th>
                        <th className="px-3 py-2 text-right font-medium">Failed</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {rows.map((r) => (
                        <tr key={r._id}>
                            <td className="max-w-[22rem] px-3 py-2">
                                <Link href={recordHref(kind, r._id)} className="block truncate font-medium text-neutral-900 hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400">
                                    {r.name || r.externalId}
                                </Link>
                                <ExternalId id={r.externalId} />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.imported}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-400">{r.duplicates || <span className="text-neutral-400">0</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">{r.failed || <span className="text-neutral-400">0</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
