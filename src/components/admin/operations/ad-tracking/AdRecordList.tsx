"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FileUp, Search } from "lucide-react"
import { AD_KIND_META, type AdKind } from "@/constants/adTracking"
import { canImportLeads } from "@/constants/adTrackingRoles"
import { useAuth } from "@/contexts/AuthContext"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { usePagination } from "@/hooks/usePagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import Pagination from "@/components/admin/operations/Pagination"
import type { AdRecordRow } from "@/types/adTracking"
import AdTrackingTabs from "./AdTrackingTabs"
import { AD_TRACKING_API, AD_TRACKING_PAGE, formatDate, recordHref } from "./api"
import { AdChain, ExternalId, PlatformBadge, StatsCells } from "./bits"

const SORTS = [
    { value: "recent", label: "Latest lead first" },
    { value: "leads", label: "Most leads first" },
    { value: "name", label: "Name" },
] as const

const SUBTITLE: Record<AdKind, string> = {
    campaign: "Every campaign seen in an import. The lead count includes the leads of its ad sets and ads.",
    adSet: "Every ad set seen in an import, with the campaign it belongs to.",
    ad: "Every ad seen in an import, with its ad set, campaign and form.",
    form: "Every lead form seen in an import. The count includes paid and organic leads.",
}

/**
 * One list page: campaigns, ad sets, ads or lead forms. Search, sort and
 * page are in the URL, like the other list pages.
 */
export default function AdRecordList({ kind }: { kind: AdKind }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { user } = useAuth()
    const { page, setPage } = usePagination()

    const search = searchParams.get("search") ?? ""
    const sort = searchParams.get("sort") ?? "recent"

    const [draft, setDraft] = useState(search)
    const [rows, setRows] = useState<AdRecordRow[]>([])
    const [total, setTotal] = useState(0)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    const meta = AD_KIND_META[kind]

    const setParam = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString())
            if (value) params.set(key, value)
            else params.delete(key)
            params.delete("page")
            const qs = params.toString()
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
        },
        [pathname, router, searchParams]
    )

    // Search as the person types, a moment after they stop.
    useEffect(() => {
        if (draft === search) return
        const t = setTimeout(() => setParam("search", draft.trim()), 350)
        return () => clearTimeout(t)
    }, [draft, search, setParam])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams({ page: String(page), sort })
                if (search) params.set("search", search)
                const res = await fetch(`${AD_TRACKING_API}/${meta.segment}?${params}`, { cache: "no-store" })
                const json = await res.json().catch(() => null)
                if (handleAuthError(res, json, router, setAccessError)) return
                if (json?.success) {
                    setRows(json.data)
                    setTotal(json.pagination.total)
                    setPages(json.pagination.pages)
                }
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [meta.segment, page, sort, search, router])

    if (!loading && accessError) return <AccessDenied message={accessError} />

    const showParents = kind === "adSet" || kind === "ad"

    return (
        <div className="w-0 min-w-full space-y-3">
            <AdTrackingTabs active={kind} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{meta.plural}</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{SUBTITLE[kind]}</p>
                </div>
                {canImportLeads(user?.role) && (
                    <Link
                        href={`${AD_TRACKING_PAGE}/import`}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
                    >
                        <FileUp className="h-4 w-4" />
                        Import leads
                    </Link>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <label className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={`Name or id of the ${meta.label.toLowerCase()}`}
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                </label>
                <select
                    value={sort}
                    onChange={(e) => setParam("sort", e.target.value === "recent" ? "" : e.target.value)}
                    aria-label="Sort"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                >
                    {SORTS.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
                {!loading && (
                    <span className="text-sm text-neutral-500">
                        {total} {total === 1 ? meta.label.toLowerCase() : meta.plural.toLowerCase()}
                    </span>
                )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                            <th className="px-3 py-2 font-medium">{meta.label}</th>
                            {showParents && <th className="hidden px-3 py-2 font-medium md:table-cell">Belongs to</th>}
                            {kind === "ad" && <th className="hidden px-3 py-2 font-medium lg:table-cell">Form</th>}
                            <th className="px-3 py-2 text-right font-medium">Leads</th>
                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Converted</th>
                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Last lead</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                        {loading &&
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={6} className="px-3 py-3">
                                        <div className="h-5 animate-pulse rounded bg-slate-100 dark:bg-neutral-800" />
                                    </td>
                                </tr>
                            ))}

                        {!loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-sm text-neutral-500">
                                    {search
                                        ? `No ${meta.plural.toLowerCase()} match "${search}".`
                                        : `No ${meta.plural.toLowerCase()} yet. Import a Meta leads export, and they appear here.`}
                                </td>
                            </tr>
                        )}

                        {!loading &&
                            rows.map((r) => (
                                <tr key={r._id} className="transition hover:bg-slate-50 dark:hover:bg-neutral-800/50">
                                    <td className="max-w-[20rem] px-3 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Link
                                                href={recordHref(kind, r._id)}
                                                className="truncate font-medium text-neutral-900 hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400"
                                            >
                                                {r.name || r.externalId}
                                            </Link>
                                            <PlatformBadge platform={r.platform} />
                                        </div>
                                        <ExternalId id={r.externalId} />
                                    </td>
                                    {showParents && (
                                        <td className="hidden max-w-[18rem] px-3 py-2 md:table-cell">
                                            {r.parents.length > 0 ? <AdChain links={r.parents} /> : <span className="text-xs text-neutral-400">Not known</span>}
                                        </td>
                                    )}
                                    {kind === "ad" && (
                                        <td className="hidden max-w-[14rem] px-3 py-2 lg:table-cell">
                                            {r.form ? <AdChain links={[r.form]} /> : <span className="text-xs text-neutral-400">—</span>}
                                        </td>
                                    )}
                                    <StatsCells stats={r.stats} />
                                    <td className="hidden whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-500 sm:table-cell">
                                        {formatDate(r.stats.lastLeadAt)}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {!loading && pages > 1 && <Pagination page={page} totalPages={pages} onChange={setPage} />}
        </div>
    )
}
