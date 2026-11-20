"use client"

import Link from "next/link"
import clsx from "clsx"
import {
    AlertTriangle,
    Clock,
    MoreHorizontal,
    Users,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUS_META,
    type CampaignStatus,
} from "@/constants/emailStatus"
import type { EmailCampaignRow } from "@/types/email"

/**
 * One campaign in the list.
 *
 * The action menu is built from `allowedActions`, which the server derives
 * from the one transition map. A completed campaign does not show a
 * greyed-out Pause; it does not show Pause at all, and the server would
 * refuse it anyway.
 */

/** A status the menu offers, and what to call the action that gets there. */
const ACTION_LABELS: Partial<Record<CampaignStatus, { label: string; action: string; danger?: boolean }>> = {
    [CAMPAIGN_STATUS.SCHEDULED]: { label: "Schedule", action: "schedule" },
    [CAMPAIGN_STATUS.QUEUEING]: { label: "Send now", action: "send-now" },
    [CAMPAIGN_STATUS.DRAFT]: { label: "Back to draft", action: "unschedule" },
    [CAMPAIGN_STATUS.PAUSED]: { label: "Pause", action: "pause" },
    [CAMPAIGN_STATUS.SENDING]: { label: "Resume", action: "resume" },
    [CAMPAIGN_STATUS.CANCELLED]: { label: "Cancel", action: "cancel", danger: true },
    [CAMPAIGN_STATUS.ARCHIVED]: { label: "Archive", action: "archive" },
}

export default function CampaignRow({
    campaign,
    precisionMinutes,
    onAction,
    busy,
}: {
    campaign: EmailCampaignRow
    precisionMinutes: number | null
    onAction: (action: string, campaign: EmailCampaignRow) => void
    busy: boolean
}) {
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) return

        function onDocumentClick(event: MouseEvent) {
            if (!menuRef.current?.contains(event.target as Node)) {
                setMenuOpen(false)
            }
        }

        document.addEventListener("mousedown", onDocumentClick)
        return () => document.removeEventListener("mousedown", onDocumentClick)
    }, [menuOpen])

    const meta = CAMPAIGN_STATUS_META[campaign.status as CampaignStatus]
    const sending = campaign.status === CAMPAIGN_STATUS.SENDING
    const showProgress =
        campaign.counts.total > 0 &&
        (sending ||
            campaign.status === CAMPAIGN_STATUS.PAUSED ||
            campaign.status === CAMPAIGN_STATUS.HALTED)

    const actions = campaign.allowedActions
        .map((status) => ACTION_LABELS[status as CampaignStatus])
        .filter(Boolean) as Array<{ label: string; action: string; danger?: boolean }>

    return (
        <li className="relative flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-neutral-800">
            <div className="min-w-0 flex-1">
                <Link
                    href={`/admin/operations/email/campaigns/${campaign._id}`}
                    className="block"
                >
                    <div className="truncate text-sm font-medium text-slate-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400">
                        {campaign.name}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-neutral-400">
                        {campaign.subject || "No subject yet"}
                    </div>
                </Link>

                {showProgress && (
                    <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
                            <div
                                className={clsx(
                                    "h-full rounded-full transition-all",
                                    campaign.status === CAMPAIGN_STATUS.HALTED
                                        ? "bg-orange-500"
                                        : "bg-emerald-500"
                                )}
                                style={{ width: `${campaign.progress}%` }}
                            />
                        </div>
                        <span className="text-[11px] tabular-nums text-slate-500 dark:text-neutral-500">
                            {campaign.counts.submitted + campaign.counts.delivered}
                            {" of "}
                            {campaign.counts.total}
                        </span>
                    </div>
                )}

                {campaign.status === CAMPAIGN_STATUS.HALTED &&
                    campaign.haltedReason && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-orange-600 dark:text-orange-400">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span className="line-clamp-2">
                                {campaign.haltedReason}
                            </span>
                        </div>
                    )}
            </div>

            {/* Scheduled time, in the zone the person chose rather than
                the viewer's, because that is the decision they made. */}
            {campaign.scheduledAt && campaign.status === CAMPAIGN_STATUS.SCHEDULED && (
                <div className="hidden text-right sm:block">
                    <div className="flex items-center gap-1 text-xs text-slate-700 dark:text-neutral-300">
                        <Clock size={12} className="text-slate-400" />
                        {campaign.scheduleWall
                            ? campaign.scheduleWall.replace("T", " ")
                            : new Date(campaign.scheduledAt).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-neutral-600">
                        {campaign.scheduleZone}
                        {precisionMinutes ? ` · ±${precisionMinutes} min` : ""}
                    </div>
                </div>
            )}

            {campaign.counts.total > 0 && !showProgress && (
                <div className="hidden items-center gap-1 text-xs text-slate-500 sm:flex dark:text-neutral-400">
                    <Users size={12} className="text-slate-400" />
                    {campaign.counts.total}
                </div>
            )}

            <span
                className={clsx(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                    meta?.color ?? "bg-slate-500 text-white"
                )}
            >
                {meta?.label ?? "Unknown"}
            </span>

            {actions.length > 0 && (
                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        aria-label="Actions"
                        disabled={busy}
                        onClick={() => setMenuOpen((o) => !o)}
                        className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                        <MoreHorizontal size={16} />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                            {actions.map((item) => (
                                <button
                                    key={item.action}
                                    type="button"
                                    onClick={() => {
                                        setMenuOpen(false)
                                        onAction(item.action, campaign)
                                    }}
                                    className={clsx(
                                        "block w-full px-3 py-1.5 text-left text-xs transition",
                                        item.danger
                                            ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                            : "text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </li>
    )
}
