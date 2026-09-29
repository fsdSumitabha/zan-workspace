"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, FileSpreadsheet, FileUp } from "lucide-react"
import { UPLOAD_STATUS } from "@/constants/leadSourceStatus"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { formatDay } from "@/lib/lead-sources/day"
import { usePagination } from "@/hooks/usePagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import Pagination from "@/components/admin/operations/Pagination"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import { RegionBadge } from "@/components/admin/operations/region/RegionBadge"
import type { LeadSourceUploadSummary } from "@/types/leadSource"
import { LEAD_SOURCES_API, LEAD_SOURCES_PAGE } from "@/components/admin/operations/lead-sources/api"

export default function UploadsClient() {
    const router = useRouter()
    const { page, setPage } = usePagination()
    const [uploads, setUploads] = useState<LeadSourceUploadSummary[]>([])
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`${LEAD_SOURCES_API}/uploads?page=${page}`, { cache: "no-store" })
            const json = await res.json().catch(() => null)
            if (handleAuthError(res, json, router, setAccessError)) return
            if (json?.success) {
                setUploads(json.data)
                setPages(json.pagination.pages)
            }
        } finally {
            setLoading(false)
        }
    }, [page, router])

    useEffect(() => {
        load()
    }, [load])

    if (!loading && accessError) return <AccessDenied message={accessError} />

    return (
        <div className="w-0 min-w-full space-y-3">
            <Link
                href={LEAD_SOURCES_PAGE}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                Lead sources
            </Link>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Uploads</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Every sheet uploaded in your regions, newest first.</p>
                </div>
                <Link
                    href={`${LEAD_SOURCES_PAGE}/upload`}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
                >
                    <FileUp className="h-4 w-4" />
                    Upload sheet
                </Link>
            </div>

            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                {loading &&
                    Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse bg-slate-50 dark:bg-neutral-800/40" />)}

                {!loading && uploads.length === 0 && (
                    <p className="px-6 py-12 text-center text-sm text-neutral-500">No sheets uploaded yet.</p>
                )}

                {!loading &&
                    uploads.map((u) => (
                        <Link
                            key={u._id}
                            href={`${LEAD_SOURCES_PAGE}/uploads/${u._id}`}
                            className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-neutral-800/60 sm:px-4"
                        >
                            <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{u.fileName}</span>
                                    <RegionBadge code={u.region} />
                                    {u.status === UPLOAD_STATUS.FAILED && (
                                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                                            Failed
                                        </span>
                                    )}
                                </div>
                                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                    {u.uploadedBy?.name || "Someone"} · <TimeAgo date={u.createdAt} />
                                    {u.assignedTo?.name && <> · for {u.assignedTo.name}</>}
                                    {u.allottedDay && <> · {formatDay(u.allottedDay)}</>}
                                </p>
                            </div>
                            <div className="hidden shrink-0 items-center gap-3 text-xs tabular-nums sm:flex">
                                <span className="text-emerald-700 dark:text-emerald-400">{u.counts.imported} imported</span>
                                {u.counts.warned > 0 && <span className="text-amber-700 dark:text-amber-400">{u.counts.warned} warnings</span>}
                                <span className={u.counts.skipped ? "text-rose-700 dark:text-rose-400" : "text-neutral-400"}>
                                    {u.counts.skipped} skipped
                                </span>
                            </div>
                        </Link>
                    ))}
            </div>

            {!loading && pages > 1 && <Pagination page={page} totalPages={pages} onChange={setPage} />}
        </div>
    )
}
