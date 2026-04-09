// src/components/admin/operations/interactions/types/CallItem.tsx
"use client"

import * as Icons from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"
import { CALL_DIRECTION_META, CALL_STATUS_META } from "@/constants/callStatus"

function formatDuration(seconds: number): string {
    if (!seconds) return "0s"
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m === 0) return `${s}s`
    return s === 0 ? `${m}m` : `${m}m ${s}s`
}

export default function CallItem({ item }: { item: any }) {

    const call = item.call

    const direction  = CALL_DIRECTION_META[call?.direction] ?? CALL_DIRECTION_META[0]
    const callStatus = CALL_STATUS_META[call?.status]       ?? CALL_STATUS_META[0]

    const DirectionIcon = Icons[direction.icon] as React.ElementType

    return (
        <div className="flex group gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icons.Phone className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">
                        {item.title && (
                            <h3 className="font-semibold text-sm capitalize tracking-wide text-gray-700 dark:text-gray-300">
                                {item.title}
                            </h3>
                        )}
                        <StatusBadge status={item.type} meta={INTERACTION_TYPE_META} />
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={item.createdAt} />
                    </span>
                </div>

                {/* Description */}
                {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {item.description}
                    </p>
                )}

                {/* Call Detail Card */}
                {call && (
                    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-neutral-50 dark:bg-neutral-800 overflow-hidden">

                        {/* Top strip — contact + badges */}
                        <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">

                            {/* Contact person */}
                            <div className="flex items-center gap-2">
                                <Icons.UserRound className="w-4 h-4 text-gray-400 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-none">
                                        {call.contactPersonName}
                                    </p>
                                    {call.contactPersonPhone && (
                                        <a
                                            href={`tel:${call.contactPersonPhone}`}
                                            className="text-xs text-blue-500 hover:underline mt-0.5 inline-block"
                                        >
                                            {call.contactPersonPhone}
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Direction + Status */}
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300">
                                    <DirectionIcon className="w-3 h-3" />
                                    {direction.label}
                                </span>
                            </div>
                        </div>

                        {/* Middle row — call time + duration */}
                        <div className="flex items-center gap-5 px-3 py-2 text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700 flex-wrap">
                            {call.callTime && (
                                <span className="flex items-center gap-1">
                                    <Icons.CalendarClock className="w-3 h-3 shrink-0" />
                                    {new Date(call.callTime).toLocaleString(undefined, {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                    })}
                                </span>
                            )}
                            {!!call.duration && (
                                <span className="flex items-center gap-1">
                                    <Icons.Timer className="w-3 h-3 shrink-0" />
                                    {formatDuration(call.duration)}
                                </span>
                            )}
                        </div>

                        {/* Notes */}
                        {call.notes && (
                            <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                    <Icons.NotebookPen className="w-3 h-3" />
                                    Notes
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {call.notes}
                                </p>
                            </div>
                        )}

                        {/* Recording — audio player + download */}
                        {call.recordingUrl && (
                            <div className="px-3 py-2.5 space-y-2">
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                    <Icons.Mic className="w-3 h-3" />
                                    Recording
                                </p>
                                <div className="flex items-center gap-2">
                                    <audio
                                        controls
                                        src={call.recordingUrl}
                                        className="flex-1 h-8 accent-emerald-600"
                                    />
                                    <a
                                        href={call.recordingUrl}
                                        download
                                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition shrink-0"
                                    >
                                        <Icons.Download className="w-3 h-3" />
                                        Download
                                    </a>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    )
}