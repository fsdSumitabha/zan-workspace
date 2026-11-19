"use client"

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Clock, Globe2 } from "lucide-react"

import {
    dateKeyInZone,
    formatClockWithZone,
    formatDay,
    formatMoment,
    formatOffset,
    sameClock,
    zoneOffsetMinutes,
    zonePlace,
} from "@/lib/time/zone"
import { formatMeetingShort } from "@/lib/time/meetingTime"
import { useViewerZone } from "./useViewerZone"

dayjs.extend(relativeTime)

interface Props {
    /** The meeting's start, as saved: an ISO moment. */
    at: string | Date
    /** The client's zone. Pass meetingZone(meeting). */
    clientZone: string
    /**
     * card:   two short lines, for meeting cards and timeline cards.
     * line:   one short line, for narrow lists. The client's time is in the tooltip.
     * detail: labelled rows with UTC offsets, for the meeting page.
     */
    variant?: "card" | "line" | "detail"
    /** Strike the time through, for a cancelled meeting. */
    muted?: boolean
}

/**
 * A meeting time, written for the person looking at it:
 *
 *   Wed, 19 Nov · 1:30 PM IST · in 3 hours
 *   Client: 12:00 PM GST · Dubai
 *
 * The first line is always in the viewer's zone. The second line shows the
 * client's clock, and only when it differs. A clock time on screen always
 * carries its zone name, so nobody has to guess whose 7:00 PM it is.
 */
export default function MeetingTime({ at, clientZone, variant = "card", muted = false }: Props) {
    const viewerZone = useViewerZone()
    const date = new Date(at)

    if (Number.isNaN(date.getTime())) {
        return <span className="text-neutral-500">—</span>
    }

    const same = sameClock(date, viewerZone, clientZone)
    const place = zonePlace(clientZone)
    const otherDay = dateKeyInZone(date, viewerZone) !== dateKeyInZone(date, clientZone)
    const clientText = otherDay
        ? formatMoment(date, clientZone)
        : formatClockWithZone(date, clientZone)

    if (variant === "line") {
        const tooltip = same
            ? `${formatMoment(date, viewerZone)} · same for the client`
            : `You: ${formatMoment(date, viewerZone)}\nClient: ${formatMoment(date, clientZone)} · ${place}`
        return (
            <span title={tooltip} className={muted ? "line-through" : undefined}>
                {formatMeetingShort(date, viewerZone)}
            </span>
        )
    }

    if (variant === "detail") {
        const mine = `${formatMoment(date, viewerZone, { year: true })} (${formatOffset(zoneOffsetMinutes(date, viewerZone))})`
        const theirs = `${formatMoment(date, clientZone, { year: true })} (${formatOffset(zoneOffsetMinutes(date, clientZone))})`
        return (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-neutral-500">{same ? "Time" : "Your time"}</dt>
                <dd className={`text-neutral-900 dark:text-neutral-100 font-medium ${muted ? "line-through" : ""}`}>
                    {mine}
                    {same && <span className="font-normal text-neutral-500"> · same for you and the client ({place})</span>}
                </dd>
                {!same && (
                    <>
                        <dt className="text-neutral-500">Client&apos;s time</dt>
                        <dd className={`text-neutral-900 dark:text-neutral-100 ${muted ? "line-through" : ""}`}>
                            {theirs} <span className="text-neutral-500">· {place}</span>
                        </dd>
                    </>
                )}
            </dl>
        )
    }

    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
                <Clock className="w-3 h-3 shrink-0 text-neutral-400" aria-hidden />
                <span className={`font-medium text-neutral-700 dark:text-neutral-200 ${muted ? "line-through" : ""}`}>
                    {formatDay(date, viewerZone)} · {formatClockWithZone(date, viewerZone)}
                </span>
                <span className="text-neutral-500">· {dayjs(date).fromNow()}</span>
            </div>
            {!same && (
                <div className="flex items-center gap-1.5 flex-wrap text-neutral-500">
                    <Globe2 className="w-3 h-3 shrink-0 text-neutral-400" aria-hidden />
                    <span className={muted ? "line-through" : undefined}>
                        Client: {clientText} · {place}
                    </span>
                </div>
            )}
        </div>
    )
}
