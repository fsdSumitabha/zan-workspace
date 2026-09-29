"use client"

import type { ReactNode } from "react"
import { AlarmClock, ArrowRightLeft, CalendarDays, FileUp, ListChecks, StickyNote, UserRound } from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import { LEAD_SOURCE_ACTIVITY } from "@/constants/leadSourceStatus"
import { formatDay } from "@/lib/lead-sources/day"
import type { LeadSourceActivityItem } from "@/types/leadSource"
import { formatCallback } from "./callback"
import StatusPill from "./StatusPill"

const ICON: Record<number, typeof StickyNote> = {
    [LEAD_SOURCE_ACTIVITY.UPLOADED]: FileUp,
    [LEAD_SOURCE_ACTIVITY.NOTE]: StickyNote,
    [LEAD_SOURCE_ACTIVITY.STATUS]: ListChecks,
    [LEAD_SOURCE_ACTIVITY.CALLBACK]: AlarmClock,
    [LEAD_SOURCE_ACTIVITY.ASSIGNED]: UserRound,
    [LEAD_SOURCE_ACTIVITY.DAY]: CalendarDays,
    [LEAD_SOURCE_ACTIVITY.CONVERTED]: ArrowRightLeft,
}

function strong(value: ReactNode) {
    return <span className="font-medium text-neutral-800 dark:text-neutral-200">{value}</span>
}

/** A day inside a sentence: "today", "tomorrow", or "Mon 28 Sep". */
function dayInSentence(day: string): string {
    const text = formatDay(day)
    return ["Today", "Tomorrow", "Yesterday"].includes(text) ? text.toLowerCase() : text
}

/** "to call today", "to call on Mon 28 Sep". */
function toCallOn(day: string): string {
    const text = dayInSentence(day)
    return /^(today|tomorrow|yesterday)$/.test(text) ? `to call ${text}` : `to call on ${text}`
}

function describe(a: LeadSourceActivityItem): ReactNode {
    switch (a.type) {
        case LEAD_SOURCE_ACTIVITY.UPLOADED: {
            const to = (a.to ?? {}) as { assignee?: string | null; day?: string | null }
            return (
                <>
                    uploaded it from {strong(a.text)}
                    {to.assignee && <>, for {strong(to.assignee)}</>}
                    {to.day && <> {strong(toCallOn(to.day))}</>}
                </>
            )
        }
        case LEAD_SOURCE_ACTIVITY.NOTE:
            return <>added a note</>
        case LEAD_SOURCE_ACTIVITY.STATUS:
            return (
                <span className="inline-flex flex-wrap items-center gap-1">
                    {a.from === a.to ? (
                        <>marked it <StatusPill status={Number(a.to)} /> again</>
                    ) : (
                        <>
                            changed <StatusPill status={Number(a.from)} /> to <StatusPill status={Number(a.to)} />
                        </>
                    )}
                    {a.callbackAt && <>, call back {strong(formatCallback(a.callbackAt))}</>}
                </span>
            )
        case LEAD_SOURCE_ACTIVITY.CALLBACK:
            return a.callbackAt ? (
                <>
                    set a callback for {strong(formatCallback(a.callbackAt))}
                    {a.to !== undefined && a.from !== a.to && <> and marked it Call Back</>}
                </>
            ) : (
                <>cleared the callback</>
            )
        case LEAD_SOURCE_ACTIVITY.ASSIGNED:
            return a.to ? (
                <>
                    assigned it to {strong(String(a.to))}
                    {a.from ? <> (was {String(a.from)})</> : null}
                </>
            ) : (
                <>removed the assignee{a.from ? <> ({String(a.from)})</> : null}</>
            )
        case LEAD_SOURCE_ACTIVITY.DAY:
            return a.to ? (
                <>
                    moved it to {strong(dayInSentence(String(a.to)))}
                    {a.from ? <> (was {dayInSentence(String(a.from))})</> : null}
                </>
            ) : (
                <>removed the day</>
            )
        case LEAD_SOURCE_ACTIVITY.CONVERTED:
            return <>converted it to a lead</>
        default:
            return <>made a change</>
    }
}

/** What happened to a lead source, newest first. */
export default function ActivityTimeline({ items }: { items: LeadSourceActivityItem[] }) {
    if (items.length === 0) {
        return <p className="py-6 text-center text-sm text-neutral-500">Nothing yet.</p>
    }

    return (
        <ol className="relative space-y-4 pl-7">
            <span className="absolute bottom-1 left-[11px] top-1 w-px bg-slate-200 dark:bg-neutral-800" aria-hidden="true" />
            {items.map((a) => {
                const Icon = ICON[a.type] ?? StickyNote
                return (
                    <li key={a._id} className="relative">
                        <span className="absolute -left-7 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-700">
                            <Icon className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                        </span>
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                            {strong(a.byName || "Someone")} {describe(a)}
                            <span className="ml-1.5 whitespace-nowrap">
                                · <TimeAgo date={a.at} />
                            </span>
                        </div>
                        {a.text && a.type !== LEAD_SOURCE_ACTIVITY.UPLOADED && (
                            <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200">
                                {a.text}
                            </p>
                        )}
                    </li>
                )
            })}
        </ol>
    )
}
