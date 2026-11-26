"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, FileSpreadsheet, FileUp } from "lucide-react"
import { LEAD_IMPORT_STATUS } from "@/constants/adTracking"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { usePagination } from "@/hooks/usePagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import Pagination from "@/components/admin/operations/Pagination"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import { RegionBadge } from "@/components/admin/operations/region/RegionBadge"
import type { LeadImportSummary } from "@/types/adTracking"
import { AD_TRACKING_API, AD_TRACKING_PAGE } from "./api"
import { PlatformBadge } from "./bits"

/** Every lead import in the person's regions, newest first. Built like the lead source uploads list. */
export default function ImportsList() {
    const router = useRouter()
    const { page, setPage } = usePagination()
    const [imports, setImports] = useState<LeadImportSummary[]>([])
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`${AD_TRACKING_API}/imports?page=${page}`, { cache: "no-store" })
            const json = await res.json().catch(() => null)
            if (handleAuthError(res, json, router, setAccessError)) return
            if (json?.success) {
                setImports(json.data)
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
                href={AD_TRACKING_PAGE}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                Ad tracking
            </Link>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Lead imports</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Every sheet of leads imported in your regions, newest first.</p>
                </div>
                <Link
                    href={`${AD_TRACKING_PAGE}/import`}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
                >
                    <FileUp className="h-4 w-4" />
                    Import leads
                </Link>
            </div>

            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse bg-slate-50 dark:bg-neutral-800/40" />)}

                {!loading && imports.length === 0 && (
                    <p className="px-6 py-12 text-center text-sm text-neutral-500">No leads imported yet.</p>
                )}

                {!loading &&
                    imports.map((u) => (
                        <Link
                            key={u._id}
                            href={`${AD_TRACKING_PAGE}/imports/${u._id}`}
                            className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-neutral-800/60 sm:px-4"
                        >
                            <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{u.fileName}</span>
                                    <RegionBadge code={u.region} />
                                    <PlatformBadge platform={u.platform} />
                                    {u.status === LEAD_IMPORT_STATUS.FAILED && (
                                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                                            Failed
                                        </span>
                                    )}
                                </div>
                                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                    {u.uploadedBy?.name || "Someone"} · <TimeAgo date={u.createdAt} />
                                </p>
                            </div>
                            <div className="hidden shrink-0 items-center gap-3 text-xs tabular-nums sm:flex">
                                <span className="text-emerald-700 dark:text-emerald-400">{u.counts.imported} imported</span>
                                <span className={u.counts.duplicates ? "text-sky-700 dark:text-sky-400" : "text-neutral-400"}>
                                    {u.counts.duplicates} duplicates
                                </span>
                                <span className={u.counts.failed ? "text-rose-700 dark:text-rose-400" : "text-neutral-400"}>
                                    {u.counts.failed} failed
                                </span>
                            </div>
                        </Link>
                    ))}
            </div>

            {!loading && pages > 1 && <Pagination page={page} totalPages={pages} onChange={setPage} />}
        </div>
    )
}
