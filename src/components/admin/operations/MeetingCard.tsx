"use client"

import Link from "next/link"
import * as Icons from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"

import { MEETING_STATUS_META } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"

export default function MeetingCard({ item }: { item: any }) {
    const Icon =
        (Icons as any)[item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)] ||
        Icons.Calendar

    const meeting = item

    // Dynamic entity route
    const entityHref = `/admin/${meeting.entity?.label?.toLowerCase()}s/${meeting.entityId}`

    return (
        <div className="relative flex group gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Entity Ribbon */}
            <div className="absolute top-0 right-0">
                <div className="text-[10px] px-2 py-1 bg-emerald-600 text-white rounded-bl-lg rounded-tr-xl shadow-sm">
                    {meeting.entity?.label || "Unknown"}
                </div>
            </div>

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

                        <h3 className="font-medium text-sm">
                            {meeting.title}
                        </h3>

                        {meeting.status && (
                            <StatusBadge
                                status={meeting.status}
                                meta={MEETING_STATUS_META}
                            />
                        )}
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap flex gap-2">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={meeting.createdAt} />
                    </span>
                </div>

                {/* Entity Title (Clickable) */}
                {meeting.entity?.title && (
                    <Link
                        href={entityHref}
                        className="text-sm font-medium text-emerald-600 hover:underline"
                    >
                        {meeting.entity.title}
                    </Link>
                )}

                {/* Agenda */}
                {meeting.agenda && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Agenda: {meeting.agenda}
                    </p>
                )}

                {/* Description */}
                {meeting.description && (
                    <p className="text-sm text-gray-500">
                        {meeting.description}
                    </p>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-gray-500 pt-1">

                    {/* Left */}
                    <div className="flex items-center gap-1">
                        Scheduled: <TimeAgo date={meeting.scheduledAt} />
                    </div>

                    {/* Right */}
                    {meeting.meetingType === MEETING_TYPE.ONLINE &&
                        meeting.meetingLink && (
                            <a
                                href={meeting.meetingLink}
                                target="_blank"
                                className="text-emerald-600 hover:underline flex items-center gap-1"
                            >
                                <Icons.ExternalLink className="w-3 h-3" />
                                Join
                            </a>
                        )}
                </div>
            </div>
        </div>
    )
}