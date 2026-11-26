"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, FileSpreadsheet, FileUp } from "lucide-react"
import { AD_KIND_META, AD_KINDS } from "@/constants/adTracking"
import { canImportLeads } from "@/constants/adTrackingRoles"
import { useAuth } from "@/contexts/AuthContext"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import type { AdTrackingOverview as Overview } from "@/types/adTracking"
import AdTrackingTabs from "./AdTrackingTabs"
import { AD_TRACKING_API, AD_TRACKING_PAGE, CARD, formatDate, listHref, recordHref } from "./api"
import { ExternalId, PlatformBadge, Tile } from "./bits"

const TOTAL_KEY = { campaign: "campaigns", adSet: "adSets", ad: "ads", form: "forms" } as const

/** The Ad Tracking front page. */
export default function AdTrackingOverview() {
    const router = useRouter()
    const { user } = useAuth()
    const [data, setData] = useState<Overview | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`${AD_TRACKING_API}/overview`, { cache: "no-store" })
                const json = await res.json().catch(() => null)
                if (handleAuthError(res, json, router, setAccessError)) return
                setData(json?.success ? json.data : null)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [router])

    if (!loading && accessError) return <AccessDenied message={accessError} />

    return (
        <div className="w-0 min-w-full space-y-3 pb-10">
            <AdTrackingTabs active="overview" />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Ad tracking</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Which campaign, ad set, ad and form each lead came from. Counts include only the leads you can see.
                    </p>
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

            {loading || !data ? (
                <div className={`${CARD} h-48 animate-pulse`} />
            ) : (
                <>
                    <div className={CARD}>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {AD_KINDS.map((k) => (
                                <Link key={k} href={listHref(k)} className="block rounded-lg transition hover:ring-2 hover:ring-blue-500/30">
                                    <Tile label={AD_KIND_META[k].plural} value={data.totals[TOTAL_KEY[k]]} />
                                </Link>
                            ))}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <Tile label="Leads from ads" value={data.leads.total} hint="Leads linked to a campaign, ad set, ad or form" />
                            <Tile label="Last 30 days" value={data.leads.last30Days} tone="text-blue-700 dark:text-blue-400" />
                            <Tile label="Through an ad" value={data.leads.paid} />
                            <Tile label="Organic" value={data.leads.organic} hint="Found the form without an ad" />
                            <Tile label="Converted" value={data.leads.converted} tone="text-emerald-700 dark:text-emerald-400" />
                        </div>
                    </div>

                    <div className={CARD}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Campaigns with the most leads</h2>
                            <Link href={`${listHref("campaign")}?sort=leads`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
                                All campaigns <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                        {data.topCampaigns.length === 0 ? (
                            <p className="py-6 text-center text-sm text-neutral-500">
                                No leads linked to a campaign yet. Import a Meta leads export to start.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                                            <th className="px-3 py-2 font-medium">Campaign</th>
                                            <th className="px-3 py-2 text-right font-medium">Leads</th>
                                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Converted</th>
                                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Last lead</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                                        {data.topCampaigns.map((c) => (
                                            <tr key={c._id}>
                                                <td className="max-w-[22rem] px-3 py-2">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Link
                                                            href={recordHref("campaign", c._id)}
                                                            className="truncate font-medium text-neutral-900 hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400"
                                                        >
                                                            {c.name || c.externalId}
                                                        </Link>
                                                        <PlatformBadge platform={c.platform} />
                                                    </div>
                                                    <ExternalId id={c.externalId} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums">{c.stats.total}</td>
                                                <td className="hidden px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 sm:table-cell">{c.stats.converted}</td>
                                                <td className="hidden whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-500 sm:table-cell">{formatDate(c.stats.lastLeadAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {canImportLeads(user?.role) && (
                        <div className={CARD}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Latest imports</h2>
                                <Link href={`${AD_TRACKING_PAGE}/imports`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
                                    All imports <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                            {data.recentImports.length === 0 ? (
                                <p className="py-6 text-center text-sm text-neutral-500">No leads imported yet.</p>
                            ) : (
                                <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                                    {data.recentImports.map((u) => (
                                        <li key={u._id}>
                                            <Link href={`${AD_TRACKING_PAGE}/imports/${u._id}`} className="flex items-center gap-3 py-2 hover:opacity-80">
                                                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                                                <span className="min-w-0 flex-1 truncate text-sm text-neutral-900 dark:text-neutral-100">{u.fileName}</span>
                                                <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">
                                                    {u.uploadedBy?.name || "Someone"} · <TimeAgo date={u.createdAt} />
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{u.counts.imported} imported</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
