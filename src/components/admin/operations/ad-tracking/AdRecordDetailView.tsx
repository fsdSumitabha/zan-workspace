"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import clsx from "clsx"
import { ArrowLeft } from "lucide-react"
import { AD_KIND_META, type AdKind } from "@/constants/adTracking"
import { LEAD_STATUS_META, type LeadStatus } from "@/constants/leadStatus"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import Pagination from "@/components/admin/operations/Pagination"
import PhoneText from "@/components/phone/PhoneText"
import type { AdRecordDetail, AdRecordLead } from "@/types/adTracking"
import AdTrackingTabs from "./AdTrackingTabs"
import { AD_TRACKING_API, CARD, formatDate, formatDateTime, listHref, recordHref } from "./api"
import { AdChain, ExternalId, PlatformBadge, StatsCells, Tile } from "./bits"

const CHILD_TITLE: Record<AdKind, string> = {
    campaign: "Ad sets in this campaign",
    adSet: "Ads in this ad set",
    ad: "",
    form: "Ads that open this form",
}

/**
 * One campaign, ad set, ad or lead form, traced both ways: up to the
 * records it belongs to, and down to its children and its leads.
 */
export default function AdRecordDetailView({ kind }: { kind: AdKind }) {
    const params = useParams()
    const id = params.id as string
    const router = useRouter()
    const meta = AD_KIND_META[kind]

    const [record, setRecord] = useState<AdRecordDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    const [leads, setLeads] = useState<AdRecordLead[]>([])
    const [leadPage, setLeadPage] = useState(1)
    const [leadPages, setLeadPages] = useState(1)
    const [leadsLoading, setLeadsLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                const res = await fetch(`${AD_TRACKING_API}/${meta.segment}/${id}`, { cache: "no-store" })
                const json = await res.json().catch(() => null)
                if (handleAuthError(res, json, router, setAccessError)) return
                setRecord(json?.success ? json.data : null)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id, meta.segment, router])

    useEffect(() => {
        const load = async () => {
            setLeadsLoading(true)
            try {
                const res = await fetch(`${AD_TRACKING_API}/${meta.segment}/${id}/leads?page=${leadPage}`, { cache: "no-store" })
                const json = await res.json().catch(() => null)
                if (json?.success) {
                    setLeads(json.data)
                    setLeadPages(json.pagination.pages)
                }
            } finally {
                setLeadsLoading(false)
            }
        }
        load()
    }, [id, meta.segment, leadPage])

    if (!loading && accessError) return <AccessDenied message={accessError} />

    if (loading) {
        return (
            <div className="w-0 min-w-full space-y-3">
                <AdTrackingTabs active={kind} />
                <div className={`${CARD} h-40 animate-pulse`} />
                <div className={`${CARD} h-64 animate-pulse`} />
            </div>
        )
    }

    if (!record) {
        return (
            <div className="w-0 min-w-full space-y-3">
                <AdTrackingTabs active={kind} />
                <div className={`${CARD} py-12 text-center text-sm text-neutral-500`}>{meta.label} not found.</div>
            </div>
        )
    }

    const statuses = Object.entries(record.byStatus)
        .map(([code, n]) => ({ code: Number(code) as LeadStatus, n }))
        .sort((a, b) => a.code - b.code)
    const rate = record.stats.total > 0 ? Math.round((record.stats.converted / record.stats.total) * 100) : 0

    return (
        <div className="w-0 min-w-full space-y-3 pb-10">
            <AdTrackingTabs active={kind} />

            <Link
                href={listHref(kind)}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                {meta.plural}
            </Link>

            <div className={CARD}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{meta.label}</p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="min-w-0 truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                        {record.name || record.externalId}
                    </h1>
                    <PlatformBadge platform={record.platform} />
                    {record.status && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                            {record.status}
                        </span>
                    )}
                </div>
                <ExternalId id={record.externalId} className="mt-0.5" />

                {(record.parents.length > 0 || record.form) && (
                    <div className="mt-3 space-y-1 text-sm">
                        {record.parents.length > 0 && (
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="w-20 shrink-0 text-xs text-neutral-500">Belongs to</span>
                                <AdChain links={record.parents} />
                            </div>
                        )}
                        {record.form && (
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="w-20 shrink-0 text-xs text-neutral-500">Opens form</span>
                                <AdChain links={[record.form]} />
                            </div>
                        )}
                    </div>
                )}

                <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                    First imported {formatDateTime(record.createdAt)}
                    {record.createdBy?.name && <> by {record.createdBy.name}</>}
                    {record.stats.lastLeadAt && <> · last lead {formatDateTime(record.stats.lastLeadAt)}</>}
                    {record.syncedAt && <> · synced from the platform {formatDateTime(record.syncedAt)}</>}
                </p>
                {record.aliases.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Also seen as: {record.aliases.join(" · ")}
                    </p>
                )}

                <div className={clsx("mt-4 grid grid-cols-2 gap-2", kind === "form" ? "sm:grid-cols-6" : "sm:grid-cols-4")}>
                    <Tile label="Leads" value={record.stats.total} />
                    <Tile label="Open" value={record.stats.open} tone="text-blue-700 dark:text-blue-400" />
                    <Tile label="Converted" value={record.stats.converted} tone="text-emerald-700 dark:text-emerald-400" hint={`${rate}% of the leads`} />
                    <Tile label="Lost" value={record.stats.lost} tone="text-rose-700 dark:text-rose-400" />
                    {kind === "form" && (
                        <>
                            <Tile label="From ads" value={record.paid ?? 0} hint="Leads that came through an ad" />
                            <Tile label="Organic" value={record.organic ?? 0} hint="Leads that found the form without an ad" />
                        </>
                    )}
                </div>

                {statuses.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {statuses.map(({ code, n }) => (
                            <span key={code} className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", LEAD_STATUS_META[code]?.color ?? "bg-neutral-300")}>
                                {LEAD_STATUS_META[code]?.label ?? code}: {n}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-neutral-800">
                    {record.platformFields.length > 0 ? (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                            {record.platformFields.map((f) => (
                                <div key={f.label} className="min-w-0">
                                    <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{f.label}</dt>
                                    <dd className="truncate text-neutral-900 dark:text-neutral-100" title={f.value}>{f.value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Status, objective, budget and dates come from the Meta Marketing API, which is not connected yet. A
                            sheet export carries only the id and the name.
                        </p>
                    )}
                </div>
            </div>

            {kind === "form" && record.questions && record.questions.length > 0 && (
                <div className={CARD}>
                    <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Questions on this form</h2>
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
                        {record.questions.map((q) => (
                            <li key={q.key}>{q.label}</li>
                        ))}
                    </ol>
                </div>
            )}

            {record.children && (
                <div className={CARD}>
                    <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {CHILD_TITLE[kind]} <span className="font-normal text-neutral-500">({record.children.rows.length})</span>
                    </h2>
                    {record.children.rows.length === 0 ? (
                        <p className="text-sm text-neutral-500">None yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                                        <th className="px-3 py-2 font-medium">{AD_KIND_META[record.children.kind].label}</th>
                                        {kind === "form" && <th className="hidden px-3 py-2 font-medium md:table-cell">Belongs to</th>}
                                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Converted</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                                    {record.children.rows.map((c) => (
                                        <tr key={c._id}>
                                            <td className="max-w-[22rem] px-3 py-2">
                                                <Link
                                                    href={recordHref(c.kind, c._id)}
                                                    className="block truncate font-medium text-neutral-900 hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400"
                                                >
                                                    {c.name || c.externalId}
                                                </Link>
                                                <ExternalId id={c.externalId} />
                                            </td>
                                            {kind === "form" && (
                                                <td className="hidden max-w-[18rem] px-3 py-2 md:table-cell">
                                                    <AdChain links={c.parents} />
                                                </td>
                                            )}
                                            <StatsCells stats={c.stats} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <div className={CARD}>
                <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Leads <span className="font-normal text-neutral-500">({record.stats.total})</span>
                </h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                                <th className="px-3 py-2 font-medium">Name</th>
                                <th className="hidden px-3 py-2 font-medium sm:table-cell">Phone</th>
                                <th className="px-3 py-2 font-medium">Stage</th>
                                {(kind === "campaign" || kind === "adSet") && <th className="hidden px-3 py-2 font-medium lg:table-cell">Via</th>}
                                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Form sent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                            {leadsLoading && (
                                <tr>
                                    <td colSpan={5} className="px-3 py-3">
                                        <div className="h-5 animate-pulse rounded bg-slate-100 dark:bg-neutral-800" />
                                    </td>
                                </tr>
                            )}
                            {!leadsLoading && leads.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-neutral-500">
                                        No leads you can see.
                                    </td>
                                </tr>
                            )}
                            {!leadsLoading &&
                                leads.map((l) => (
                                    <tr key={l._id}>
                                        <td className="max-w-[16rem] px-3 py-2">
                                            <Link
                                                href={`/admin/operations/leads/${l._id}`}
                                                className="block truncate font-medium text-neutral-900 hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400"
                                            >
                                                {l.name}
                                            </Link>
                                            <span className="text-xs text-neutral-500">{l.source}</span>
                                        </td>
                                        <td className="hidden whitespace-nowrap px-3 py-2 text-neutral-600 dark:text-neutral-300 sm:table-cell">
                                            <PhoneText phone={l.phone} />
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", LEAD_STATUS_META[l.status as LeadStatus]?.color)}>
                                                {LEAD_STATUS_META[l.status as LeadStatus]?.label ?? l.status}
                                            </span>
                                        </td>
                                        {(kind === "campaign" || kind === "adSet") && (
                                            <td className="hidden max-w-[14rem] px-3 py-2 lg:table-cell">
                                                {l.via ? <AdChain links={[l.via]} /> : <span className="text-xs text-neutral-400">This {meta.label.toLowerCase()}</span>}
                                            </td>
                                        )}
                                        <td className="hidden whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-500 md:table-cell">
                                            {formatDate(l.submittedAt ?? l.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
                {leadPages > 1 && <Pagination page={leadPage} totalPages={leadPages} onChange={setLeadPage} disabled={leadsLoading} />}
            </div>
        </div>
    )
}
