"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Image } from "@imagekit/next"
import clsx from "clsx"
import { ArrowUpRight, CalendarClock } from "lucide-react"
import { useRegion } from "@/contexts/RegionContext"
import { formatPhoneForDisplay } from "@/lib/phone"
import { LEAD_SOURCE_STATUS } from "@/constants/leadSourceStatus"
import { daysBetween, formatDay } from "@/lib/lead-sources/day"
import type { LeadSourceRow as Row, LeadSourceView } from "@/types/leadSource"
import { LEAD_SOURCES_PAGE } from "./api"
import { callbackState } from "./callback"
import CallbackMenu from "./CallbackMenu"
import CallButton from "./CallButton"
import StatusMenu from "./StatusMenu"

interface Props {
    row: Row
    view: LeadSourceView
    today: string
    now: number
    selected: boolean
    /** True while any row is selected. Rows then toggle instead of opening. */
    selecting: boolean
    showAssignee: boolean
    onToggle: (id: string) => void
    onUpdated: (row: Row) => void
    onMenuOpenChange: (open: boolean) => void
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}

/**
 * Who the source is assigned to: their avatar, or their initials when they
 * have no avatar or it fails to load. The parent keys this by the avatar URL,
 * so a new URL gets a fresh try.
 */
function AssigneeChip({ assignee }: { assignee: Row["assignee"] }) {
    const [broken, setBroken] = useState(false)
    const showImage = !!assignee?.avatar && !broken

    return (
        <span
            title={assignee ? `Assigned to ${assignee.name}` : "Not assigned"}
            className={clsx(
                "hidden h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold sm:inline-flex",
                assignee
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-600"
            )}
        >
            {showImage ? (
                <Image
                    src={assignee.avatar}
                    alt=""
                    width={28}
                    height={28}
                    transformation={[{ width: 56, height: 56 }]}
                    className="h-full w-full object-cover"
                    onError={() => setBroken(true)}
                />
            ) : assignee ? (
                initials(assignee.name)
            ) : (
                "?"
            )}
        </span>
    )
}

/**
 * One lead source on the list. Two short lines, so a screen holds many:
 *
 *   Name · company · domain                 [callback] [day] [who] [Status ▾] (call)
 *   +1 415 555 0123 · the newest note, dimmed
 *
 * While rows are being selected, the call buttons are hidden and a click on
 * a row selects it instead of opening it.
 */
export default function LeadSourceRow({
    row,
    view,
    today,
    now,
    selected,
    selecting,
    showAssignee,
    onToggle,
    onUpdated,
    onMenuOpenChange,
}: Props) {
    const router = useRouter()
    const { phoneCountry } = useRegion()

    const href = `${LEAD_SOURCES_PAGE}/${row._id}`
    const due = !!row.callbackAt && callbackState(row.callbackAt, now) === "due"
    const converted = row.status === LEAD_SOURCE_STATUS.CONVERTED

    const open = () => {
        if (selecting) onToggle(row._id)
        else router.push(href)
    }

    let dayChip: { text: string; tone: string; title: string } | null = null
    if (row.allottedDay) {
        const late = daysBetween(row.allottedDay, today)
        if (view === "today") {
            if (row.section === 2) {
                dayChip = {
                    text: formatDay(row.allottedDay, today),
                    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
                    title: `Set for ${formatDay(row.allottedDay, today)}, ${late} day${late === 1 ? "" : "s"} ago, and still open`,
                }
            }
        } else if (view !== "day") {
            dayChip = {
                text: formatDay(row.allottedDay, today),
                tone:
                    late > 0 && !converted
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-slate-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
                title: `Day: ${formatDay(row.allottedDay, today)}`,
            }
        }
    }

    return (
        <div
            onClick={open}
            className={clsx(
                "group relative flex min-h-[56px] cursor-pointer items-center gap-2.5 border-l-4 py-2 pl-2 pr-2.5 transition-colors sm:gap-3",
                selected
                    ? "border-l-blue-500 bg-blue-50/80 dark:bg-blue-500/10"
                    : due
                      ? "border-l-rose-500 bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-500/[0.07] dark:hover:bg-rose-500/10"
                      : "border-l-transparent hover:bg-slate-50 dark:hover:bg-neutral-800/60"
            )}
        >
            <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(row._id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${row.name}`}
                className={clsx(
                    "h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-blue-600 transition-opacity",
                    selecting || selected ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                )}
            />

            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                    <Link
                        href={href}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (selecting) {
                                e.preventDefault()
                                onToggle(row._id)
                            }
                        }}
                        className="truncate text-sm font-semibold text-neutral-900 hover:underline dark:text-neutral-100"
                    >
                        {row.name}
                    </Link>
                    {row.listInfo.length > 0 && (
                        <span className="hidden truncate text-xs text-neutral-500 sm:inline dark:text-neutral-400">
                            {row.listInfo.join(" · ")}
                        </span>
                    )}
                    {converted && row.convertedLeadId && (
                        <Link
                            href={`/admin/operations/leads/${row.convertedLeadId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                            Lead <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    )}
                </div>

                <div className="flex min-w-0 items-center gap-1.5 text-xs leading-5">
                    <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatPhoneForDisplay(row.phone, phoneCountry)}
                    </span>
                    {row.lastNote ? (
                        <>
                            <span className="text-neutral-300 dark:text-neutral-600" aria-hidden="true">·</span>
                            <span className="truncate text-neutral-400 dark:text-neutral-500" title={row.lastNote}>
                                {row.lastNote}
                            </span>
                        </>
                    ) : null}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <CallbackMenu
                    sourceId={row._id}
                    name={row.name}
                    callbackAt={row.callbackAt}
                    now={now}
                    onUpdated={onUpdated}
                    disabled={selecting}
                    onOpenChange={onMenuOpenChange}
                />

                {dayChip && (
                    <span
                        title={dayChip.title}
                        className={clsx(
                            "hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap sm:inline-flex",
                            dayChip.tone
                        )}
                    >
                        <CalendarClock className="h-3 w-3" />
                        {dayChip.text}
                    </span>
                )}

                {showAssignee && <AssigneeChip key={row.assignee?.avatar ?? ""} assignee={row.assignee} />}

                <StatusMenu
                    sourceId={row._id}
                    name={row.name}
                    status={row.status}
                    onUpdated={onUpdated}
                    disabled={selecting}
                    onOpenChange={onMenuOpenChange}
                />

                {/* Hidden while selecting, so a stray tap on a phone cannot
                    start a call when the person meant to pick rows. */}
                {!selecting && <CallButton name={row.name} phone={row.phone} />}
                {selecting && <span className="h-8 w-8" aria-hidden="true" />}
            </div>
        </div>
    )
}

export function LeadSourceRowSkeleton() {
    return (
        <div className="flex min-h-[56px] animate-pulse items-center gap-3 border-l-4 border-l-transparent py-2 pl-2 pr-2.5">
            <div className="h-4 w-4 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/5 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-3/5 rounded bg-neutral-100 dark:bg-neutral-800/70" />
            </div>
            <div className="h-6 w-20 rounded-md bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        </div>
    )
}
