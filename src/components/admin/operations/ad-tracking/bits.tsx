"use client"

import Link from "next/link"
import { useState } from "react"
import clsx from "clsx"
import { Check, ChevronRight, Copy } from "lucide-react"
import { AD_KIND_META, AD_PLATFORM_META, type AdPlatform } from "@/constants/adTracking"
import type { AdLeadStats, AdRecordLink } from "@/types/adTracking"
import { recordHref } from "./api"

/** "Meta", "Google", "Other". */
export function PlatformBadge({ platform }: { platform: AdPlatform | string | null | undefined }) {
    const meta = AD_PLATFORM_META[platform as AdPlatform]
    if (!meta) return null
    return (
        <span title={meta.label} className={clsx("rounded px-1.5 py-0.5 text-[11px] font-medium", meta.chip)}>
            {meta.short}
        </span>
    )
}

/**
 * A platform id in monospace, with a copy button. The id is how a
 * marketer finds the same campaign in Meta Ads Manager.
 */
export function ExternalId({ id, className }: { id: string; className?: string }) {
    const [copied, setCopied] = useState(false)

    const copy = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        try {
            await navigator.clipboard.writeText(id)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
        } catch {
            // The clipboard can be blocked. The id is still on screen to select.
        }
    }

    return (
        <span className={clsx("inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-neutral-500 dark:text-neutral-400", className)}>
            <span className="truncate">{id}</span>
            <button
                type="button"
                onClick={copy}
                title="Copy the id"
                aria-label="Copy the id"
                className="shrink-0 rounded p-0.5 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
        </span>
    )
}

/** Campaign › Ad set › Ad, each one a link. */
export function AdChain({ links, className }: { links: Array<AdRecordLink | null | undefined>; className?: string }) {
    const shown = links.filter((l): l is AdRecordLink => !!l)
    if (shown.length === 0) return null
    return (
        <span className={clsx("flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs", className)}>
            {shown.map((l, i) => (
                <span key={`${l.kind}-${l._id}`} className="inline-flex min-w-0 items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-neutral-400" />}
                    <Link
                        href={recordHref(l.kind, l._id)}
                        title={`${AD_KIND_META[l.kind].label}: ${l.name || l.externalId}`}
                        className="truncate text-neutral-600 hover:text-blue-600 hover:underline dark:text-neutral-300 dark:hover:text-blue-400"
                    >
                        {l.name || l.externalId}
                    </Link>
                </span>
            ))}
        </span>
    )
}

/** "12 leads · 3 converted", short enough for a table cell. */
export function StatsCells({ stats }: { stats: AdLeadStats }) {
    return (
        <>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">{stats.total}</td>
            <td className="hidden px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 sm:table-cell">
                {stats.converted || <span className="text-neutral-400">0</span>}
            </td>
        </>
    )
}

export function Tile({ label, value, tone, hint }: { label: string; value: number | string; tone?: string; hint?: string }) {
    return (
        <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-neutral-800" title={hint}>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
            <p className={clsx("text-2xl font-semibold tabular-nums", tone ?? "text-neutral-900 dark:text-neutral-100")}>{value}</p>
        </div>
    )
}
