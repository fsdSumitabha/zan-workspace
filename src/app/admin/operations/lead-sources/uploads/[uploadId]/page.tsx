"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import clsx from "clsx"
import { ArrowLeft, ArrowRight, Download, Info, TriangleAlert } from "lucide-react"
import { UPLOAD_STATUS } from "@/constants/leadSourceStatus"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { formatDay } from "@/lib/lead-sources/day"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { RegionBadge } from "@/components/admin/operations/region/RegionBadge"
import type { LeadSourceUploadReport } from "@/types/leadSource"
import { LEAD_SOURCES_API, LEAD_SOURCES_PAGE } from "@/components/admin/operations/lead-sources/api"
import ReportGrid from "@/components/admin/operations/lead-sources/ReportGrid"

const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"

export default function UploadReportPage() {
    const params = useParams()
    const uploadId = params.uploadId as string
    const router = useRouter()
    const [report, setReport] = useState<LeadSourceUploadReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`${LEAD_SOURCES_API}/uploads/${uploadId}`, { cache: "no-store" })
                const json = await res.json().catch(() => null)
                if (handleAuthError(res, json, router, setAccessError)) return
                setReport(json?.success ? json.data : null)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [uploadId, router])

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
        return <div className={`${CARD} py-12 text-center text-sm text-neutral-500`}>Upload not found.</div>
    }

    const tiles = [
        { label: "Rows read", value: report.counts.read, tone: "text-neutral-900 dark:text-neutral-100" },
        { label: "Imported", value: report.counts.imported, tone: "text-emerald-700 dark:text-emerald-400" },
        { label: "With warnings", value: report.counts.warned, tone: "text-amber-700 dark:text-amber-400" },
        { label: "Skipped", value: report.counts.skipped, tone: "text-rose-700 dark:text-rose-400" },
    ]

    const download = `${LEAD_SOURCES_API}/uploads/${report._id}/download`

    return (
        <div className="w-0 min-w-full space-y-3 pb-10">
            <Link
                href={`${LEAD_SOURCES_PAGE}/uploads`}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                Uploads
            </Link>

            <div className={CARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">{report.fileName}</h1>
                            <RegionBadge code={report.region} />
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                            {report.uploadedBy?.name || "Someone"} · {new Date(report.createdAt).toLocaleString()}
                            {report.sheetName && report.sheetName !== "CSV" && <> · sheet “{report.sheetName}”</>}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                            {report.assignedTo?.name ? <>For {report.assignedTo.name}</> : "Not assigned"}
                            {" · "}
                            {report.allottedDay ? formatDay(report.allottedDay) : "no day"}
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
                        {report.counts.skipped > 0 && (
                            <a
                                href={`${download}?only=skipped`}
                                download
                                title="Fix these rows in Excel, then upload the same file again"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            >
                                <Download className="h-4 w-4" />
                                Skipped rows only
                            </a>
                        )}
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {tiles.map((t) => (
                        <div key={t.label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-neutral-800">
                            <p className="text-[11px] uppercase tracking-wide text-neutral-500">{t.label}</p>
                            <p className={clsx("text-2xl font-semibold tabular-nums", t.tone)}>{t.value}</p>
                        </div>
                    ))}
                </div>

                {report.status === UPLOAD_STATUS.FAILED && (
                    <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
                        <TriangleAlert className="h-4 w-4" />
                        {report.error || "This upload failed. Nothing was imported."}
                    </p>
                )}

                {(report.fileNotes.length > 0 || report.missingColumns.length > 0) && (
                    <ul className="mt-3 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                        {report.fileNotes.map((note) => (
                            <li key={note} className="flex items-start gap-2">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                {note}
                            </li>
                        ))}
                        {report.missingColumns.length > 0 && (
                            <li className="flex items-start gap-2">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                Not in this file, so left empty: {report.missingColumns.join(", ")}.
                            </li>
                        )}
                    </ul>
                )}

                {report.counts.imported > 0 && (
                    <Link
                        href={`${LEAD_SOURCES_PAGE}?view=all&upload=${report._id}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                        Open the {report.counts.imported} imported sources
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                )}
            </div>

            {report.rows.length > 0 && <ReportGrid report={report} />}
        </div>
    )
}
