"use client"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { MEETING_STATUS_META } from "@/constants/meetingStatus"
import { MEETING_TYPE_META, MEETING_TYPE } from "@/constants/meetingTypes"
import MeetingLinkButton from "@/components/admin/operations/MeetingLinkButton"
import * as Icons from "lucide-react"

export default function MeetingItem({ item }: { item: any }) {
    const meeting = item.meeting

    const Icon =
        (Icons as any)[item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)] ||
        Icons.Calendar

    return (
        <div className="flex gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">

                        <h3 className="font-medium text-sm">
                            {item.title}
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

                {/* Agenda */}
                {meeting?.agenda && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                       Agenda: {meeting.agenda}
                    </p>
                )}

                {/* Description */}
                {item.description && (
                    <p className="text-sm text-gray-500">
                        {item.description}
                    </p>
                )}

                {/* Meta */}
                {meeting && (
                    <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-gray-500 pt-1">

                        {/* Left: Schedule */}
                        <div className="flex items-center gap-1">
                            Scheduled at: <TimeAgo date={meeting.scheduledAt} />
                        </div>

                        {/* Right: Actions */}
                        {meeting.meetingType === MEETING_TYPE.ONLINE &&
                            meeting.meetingLink && (
                                <MeetingLinkButton link={meeting.meetingLink} />
                            )}
                    </div>
                )}
            </div>
        </div>
    )
}