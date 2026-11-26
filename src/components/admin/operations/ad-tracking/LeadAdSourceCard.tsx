"use client"

import Link from "next/link"
import { Megaphone } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { AD_KIND_META, type AdKind } from "@/constants/adTracking"
import { canImportLeads, canViewAdTracking } from "@/constants/adTrackingRoles"
import type { AdRecordLink, LeadAdSource } from "@/types/adTracking"
import { AD_TRACKING_PAGE, formatDateTime, recordHref } from "./api"
import { PlatformBadge } from "./bits"

/**
 * Where a lead came from: Campaign › Ad set › Ad, and the form. Shown on
 * the lead page under the lead's details. Names link to the Ad Tracking
 * pages for the people who can open them, and are plain text for the rest.
 */
export default function LeadAdSourceCard({ source }: { source: LeadAdSource | null }) {
    const { user } = useAuth()
    if (!source) return null

    const canOpen = canViewAdTracking(user?.role)
    const rows: Array<{ kind: AdKind; link: AdRecordLink | null }> = [
        { kind: "campaign", link: source.campaign },
        { kind: "adSet", link: source.adSet },
        { kind: "ad", link: source.ad },
        { kind: "form", link: source.form },
    ]
    const shown = rows.filter((r) => r.link)

    // A lead from a list with no ad columns has a platform but no ad record.
    // There is nothing to trace, so the card is left out.
    if (shown.length === 0) return null

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:rounded-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-3 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Ad source</h3>
                <PlatformBadge platform={source.platform} />
                {source.organic && shown.length > 0 && (
                    <span
                        title="The person found the form without an ad"
                        className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                    >
                        Organic
                    </span>
                )}
            </div>

            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {shown.map(({ kind, link }) => (
                    <div key={kind} className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{AD_KIND_META[kind].label}</dt>
                        <dd className="truncate font-medium text-neutral-900 dark:text-neutral-100" title={link!.externalId}>
                            {canOpen ? (
                                <Link href={recordHref(kind, link!._id)} className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">
                                    {link!.name || link!.externalId}
                                </Link>
                            ) : (
                                link!.name || link!.externalId
                            )}
                        </dd>
                    </div>
                ))}
                {source.submittedAt && (
                    <div className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-neutral-500">Form sent</dt>
                        <dd className="text-neutral-900 dark:text-neutral-100">{formatDateTime(source.submittedAt)}</dd>
                    </div>
                )}
            </dl>

            {source.importId && canImportLeads(user?.role) && (
                <Link
                    href={`${AD_TRACKING_PAGE}/imports/${source.importId}`}
                    className="mt-3 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                    Open the import this lead came from
                </Link>
            )}
        </div>
    )
}
