"use client"

import Link from "next/link"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { MEETING_STATUS, MEETING_STATUS_META } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import MeetingLinkButton from "@/components/admin/operations/MeetingLinkButton"
import MeetingTime from "@/components/admin/operations/time/MeetingTime"
import { useViewerZone } from "@/components/admin/operations/time/useViewerZone"
import { meetingZone } from "@/lib/time/meetingTime"
import { formatMoment } from "@/lib/time/zone"
import { meetingPageHref } from "@/lib/meetings/links"
import * as Icons from "lucide-react"
import Tooltip from "@/components/admin/operations/tooltip/Tooltip"

/**
 * The reschedule this timeline entry wrote. The route saves the history row
 * and the entry in the same request, so their times are milliseconds apart.
 */
function matchReschedule(meeting: any, createdAt: string | undefined): any | null {
    const t = createdAt ? new Date(createdAt).getTime() : NaN
    if (!meeting || Number.isNaN(t)) return null
    let best: any = null
    let bestDiff = Infinity
    for (const entry of meeting.rescheduleHistory ?? []) {
        const diff = Math.abs(new Date(entry.changedAt).getTime() - t)
        if (diff < bestDiff) {
            best = entry
            bestDiff = diff
        }
    }
    return bestDiff <= 2 * 60_000 ? best : null
}

// What the entry's own text is, by type. A scheduled entry repeats the
// agenda, which the meeting already shows.
const DESCRIPTION_LABEL: Record<number, string> = {
    [INTERACTION_TYPE.MEETING_RESCHEDULED]: "Reason",
    [INTERACTION_TYPE.MEETING_CANCELLED]: "Reason",
    [INTERACTION_TYPE.MEETING_COMPLETED]: "Outcome",
}

export default function MeetingItem({ item }: { item: any }) {
    // Can be null: an entry whose meeting was not found.
    const meeting = item.meeting ?? null
    const viewerZone = useViewerZone()

    const Icon =
        (Icons as any)[item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)] ||
        Icons.Calendar

    const isReschedule = item.type === INTERACTION_TYPE.MEETING_RESCHEDULED
    // Older entries say "Meeting rescheduled to 11/19/2026, 8:00:00 AM": the
    // server wrote that time in UTC. The times come from the history instead.
    const title = isReschedule ? "Meeting rescheduled" : item.title
    const move = isReschedule ? matchReschedule(meeting, item.createdAt) : null

    const descriptionLabel = DESCRIPTION_LABEL[item.type]
    const isOpen =
        meeting?.status === MEETING_STATUS.SCHEDULED ||
        meeting?.status === MEETING_STATUS.RESCHEDULED

    return (
        <div className="flex group gap-3 p-4 rounded-lg dark:rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">

                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap">

                        <h3 className="font-medium text-neutral-800 dark:text-neutral-200 text-sm">
                            {title}
                        </h3>

                        {meeting?.status && (
                            <StatusBadge
                                status={meeting.status}
                                meta={MEETING_STATUS_META}
                            />
                        )}
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap flex gap-2">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={item.createdAt} />
                    </span>
                </div>

                {/* Meeting title, when the entry's own title is something else */}
                {meeting?.title && meeting.title !== title && (
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {meeting.title}
                    </p>
                )}

                {/* Agenda */}
                {meeting?.agenda && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                       Agenda: {meeting.agenda}
                    </p>
                )}

                {/* Description */}
                {meeting?.description && (
                    <p className="text-sm text-gray-500">
                        {meeting.description}
                    </p>
                )}

                {/* The reason or outcome this entry recorded */}
                {descriptionLabel && item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {descriptionLabel}: {item.description}
                    </p>
                )}

                {/* Old and new time of this reschedule, in the viewer's zone */}
                {move && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 flex flex-wrap items-center gap-x-1.5">
                        <span className="line-through text-neutral-500">
                            {formatMoment(new Date(move.oldDate), viewerZone)}
                        </span>
                        <Icons.ArrowRight className="w-3 h-3 text-neutral-400" aria-hidden />
                        <span>{formatMoment(new Date(move.newDate), viewerZone)}</span>
                    </div>
                )}

                {/* Meta */}
                {meeting && (
                    <div className="flex items-start justify-between flex-wrap gap-3 text-xs text-gray-500 pt-1">

                        {/* Left: the meeting's current time, yours and the client's */}
                        <MeetingTime
                            at={meeting.scheduledAt}
                            clientZone={meetingZone(meeting)}
                            muted={meeting.status === MEETING_STATUS.CANCELLED}
                        />

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            {meeting.meetingType === MEETING_TYPE.ONLINE &&
                                meeting.meetingLink &&
                                isOpen && (
                                    <MeetingLinkButton link={meeting.meetingLink} />
                                )}

                            {/* Straight to the meeting: reschedule, cancel, complete */}
                            <Link
                                href={meetingPageHref(String(meeting._id))}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition"
                            >
                                <Icons.ExternalLink className="w-3 h-3" />
                                Open meeting
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {item.createdBy && (
                <Tooltip content={`Created by ${item.createdBy.name} `} />
            )}
        </div>
    )
}
