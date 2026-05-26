"use client"

import { useState } from "react"
import Link from "next/link"
import * as Icons from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"

import { MEETING_STATUS, MEETING_STATUS_META } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import MeetingLinkButton from "@/components/admin/operations/MeetingLinkButton"
import RescheduleMeetingModal from "@/components/admin/operations/RescheduleMeetingModal"
import { getMeetingTemporalStatus } from "@/utils/MeetingTemporalStatus"
import { useAuth } from "@/contexts/AuthContext"
import TemporalBadge from "./TemporalBadge "

/** Roles allowed to reschedule a meeting (mirrors the backend PATCH). */
const RESCHEDULE_ROLES = [10, 60, 45, 70]

export default function MeetingCard({
    item,
    onChanged,
}: {
    item: any
    onChanged?: () => void
}) {

    const [expanded, setExpanded] = useState(false)
    const [rescheduleOpen, setRescheduleOpen] = useState(false)

    const { user } = useAuth()
    const canReschedule =
        !!user && RESCHEDULE_ROLES.includes(user.role)

    const Icon =
        (Icons as any)[item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)] ||
        Icons.Calendar

    const meeting = item

    const agenda: string = meeting.agenda || ""
    const description: string = meeting.description || ""

    // Show the toggle only when the combined detail text is long enough
    // that it would otherwise make this card taller than its siblings.
    const isLongText = agenda.length + description.length > 110
    const clampClass = !expanded && isLongText ? "line-clamp-2" : ""

    const temporalStatus = getMeetingTemporalStatus(meeting.scheduledAt)
    const isCancelledOrMissed = meeting.status === MEETING_STATUS.CANCELLED || meeting.status === MEETING_STATUS.MISSED
    const isCompleted = meeting.status === MEETING_STATUS.COMPLETED
    const isScheduled = meeting.status === MEETING_STATUS.SCHEDULED || meeting.status === MEETING_STATUS.RESCHEDULED
    const isUpcoming = isScheduled && temporalStatus === "UPCOMING"
    const isToday = isScheduled && temporalStatus === "TODAY"

    const dotColor = (isUpcoming || isToday) ? "green" : (isScheduled && temporalStatus === "PAST") ? "red" : null

    // Dynamic entity route
    const entityHref = `/admin//operations/${meeting.entity?.label?.toLowerCase()}s/${meeting.entityId}`

    return (
        <div className={`relative flex gap-3 p-4 rounded-lg dark:rounded-xl bg-white dark:bg-neutral-900 shadow transition break-words border hover:border-neutral-400 hover:shadow-md ${isCancelledOrMissed ? "border-red-500 opacity-70" : isCompleted ? "border-green-500 opacity-80" : isToday ? "border-emerald-500" : isUpcoming ? "border-blue-500" : "border-slate-200 dark:border-neutral-800"}`}>
            
            {dotColor && (
                <span className="absolute flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor === "green" ? "bg-green-400" : "bg-red-400"}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor === "green" ? "bg-green-500" : "bg-red-500"}`}></span>
                </span>
            )}

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">

                        <h3 className="font-bold text-neutral-800 dark:text-neutral-200 text-md">
                            {meeting.title}
                        </h3>

                        {meeting.status && (
                            <StatusBadge
                                status={meeting.status}
                                meta={MEETING_STATUS_META}
                            />
                        )}

                        {(meeting.status === MEETING_STATUS.SCHEDULED ||
                            meeting.status === MEETING_STATUS.RESCHEDULED) &&
                            temporalStatus && (
                                <TemporalBadge status={temporalStatus} />
                            )}

                    </div>

                    <span className="text-xs text-neutral-500 whitespace-nowrap flex gap-2">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={meeting.createdAt} />
                    </span>
                </div>

                {/* Entity Title (Clickable) */}
                {meeting.entity?.title && (
                    <Link
                        href={entityHref}
                        className="text-sm font-medium text-neutral-600 hover:underline"
                    >
                        {meeting.entity.title}
                    </Link>
                )}

                {/* Agenda */}
                {agenda && (
                    <p className={`text-sm text-gray-600 dark:text-gray-400 ${clampClass}`}>
                        Agenda: {agenda}
                    </p>
                )}

                {/* Description */}
                {description && (
                    <p className={`text-sm text-gray-500 ${clampClass}`}>
                        {description}
                    </p>
                )}

                {/* Read more / less toggle */}
                {isLongText && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="text-xs font-medium text-emerald-600 hover:underline"
                    >
                        {expanded ? "Read less" : "Read more…"}
                    </button>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-gray-500 pt-1">

                    {/* Left */}
                    <div className="flex items-center gap-1">
                        Scheduled: <TimeAgo date={meeting.scheduledAt} />
                    </div>

                    {/* Right */}
                    <div className="flex items-center gap-2">
                        {canReschedule && isScheduled && (
                            <button
                                type="button"
                                onClick={() => setRescheduleOpen(true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition"
                            >
                                <Icons.CalendarClock className="w-3 h-3" />
                                Reschedule
                            </button>
                        )}
                        {meeting.meetingType === MEETING_TYPE.ONLINE &&
                            meeting.meetingLink &&
                            isScheduled && (
                                <MeetingLinkButton link={meeting.meetingLink} />
                            )}
                    </div>
                </div>
            </div>

            <RescheduleMeetingModal
                meetingId={String(meeting._id)}
                currentScheduledAt={meeting.scheduledAt}
                open={rescheduleOpen}
                onClose={() => setRescheduleOpen(false)}
                onSuccess={() => onChanged?.()}
            />
        </div>
    )
}