"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CalendarCheck2, Clock, ExternalLink, Globe2, UserRound } from "lucide-react"

import MeetingCard from "@/components/admin/operations/MeetingCard"
import MeetingCardSkeleton from "@/components/admin/operations/skeletons/MeetingCardSkeleton"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import MeetingTime from "@/components/admin/operations/time/MeetingTime"
import { useViewerZone } from "@/components/admin/operations/time/useViewerZone"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { meetingZone } from "@/lib/time/meetingTime"
import { describeZone, formatMoment } from "@/lib/time/zone"
import { meetingParentHref } from "@/lib/meetings/links"
import { MEETING_STATUS } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"

/**
 * One meeting. The lead, client and project timelines link here with
 * "Open meeting", and so do search and the Upcoming meetings panel.
 *
 * The card at the top has every action: Join, Reschedule, Cancel, Missed,
 * Completed. Below it are the time on both clocks and the state of the
 * Google Calendar event.
 */
export default function MeetingPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string
    const viewerZone = useViewerZone()

    const [meeting, setMeeting] = useState<any | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)
    const [missing, setMissing] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/operations/meetings/${id}`, { cache: "no-store" })
            const json = await res.json().catch(() => null)

            if (handleAuthError(res, json, router, setAccessError)) return

            if (!res.ok || !json?.success) {
                setMissing(true)
                setMeeting(null)
                return
            }
            setMissing(false)
            setMeeting(json.data)
        } catch (err) {
            console.error("Failed to load meeting", err)
            setMissing(true)
        } finally {
            setLoading(false)
        }
    }, [id, router])

    useEffect(() => {
        if (id) load()
    }, [id, load])

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    const parentHref = meeting
        ? meetingParentHref(meeting.entityType, meeting.entityId ? String(meeting.entityId) : undefined)
        : null
    const clientZone = meeting ? meetingZone(meeting) : null
    const isOnline = meeting?.meetingType === MEETING_TYPE.ONLINE
    const external = meeting?.external ?? {}

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <Link
                    href="/admin/operations/meetings"
                    className="inline-flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:underline"
                >
                    <ArrowLeft className="w-4 h-4" />
                    All meetings
                </Link>

                {meeting && parentHref && (
                    <Link
                        href={parentHref}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open {meeting.entity?.label?.toLowerCase() ?? "record"}: {meeting.entity?.title}
                    </Link>
                )}
            </div>

            {loading && <MeetingCardSkeleton />}

            {!loading && missing && (
                <div className="text-center py-10 text-gray-500">
                    Meeting not found. It may belong to a region your account does not cover.
                </div>
            )}

            {!loading && meeting && clientZone && (
                <>
                    <MeetingCard item={meeting} onChanged={load} linkToPage={false} />

                    <section className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-4">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            <Clock className="w-4 h-4 text-neutral-400" />
                            When
                        </h2>

                        <MeetingTime
                            at={meeting.scheduledAt}
                            clientZone={clientZone}
                            variant="detail"
                            muted={meeting.status === MEETING_STATUS.CANCELLED}
                        />

                        <p className="flex items-start gap-1.5 text-xs text-neutral-500">
                            <Globe2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                                Client&apos;s time zone: {describeZone(clientZone, new Date(meeting.scheduledAt))}.
                                {" "}You see every time in your own zone, {describeZone(viewerZone)}.
                            </span>
                        </p>
                    </section>

                    <section className="rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-2 text-sm">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            <CalendarCheck2 className="w-4 h-4 text-neutral-400" />
                            Google Calendar
                        </h2>
                        {!isOnline ? (
                            <p className="text-neutral-600 dark:text-neutral-400">
                                Offline meeting. It has no Google Calendar event. Tell the guests about changes yourself.
                            </p>
                        ) : external.syncError ? (
                            <p className="text-amber-700 dark:text-amber-400">
                                Not up to date. {external.syncError}
                            </p>
                        ) : external.syncedAt ? (
                            <p className="text-neutral-600 dark:text-neutral-400">
                                Up to date. Google last matched this meeting on {formatMoment(new Date(external.syncedAt), viewerZone)}.
                                {" "}Guests get Google&apos;s emails when the meeting is rescheduled or cancelled.
                            </p>
                        ) : (
                            <p className="text-neutral-600 dark:text-neutral-400">
                                Made before the CRM saved its Google event. The CRM finds the event the next time the meeting is rescheduled or cancelled.
                            </p>
                        )}
                    </section>

                    {meeting.createdBy?.name && (
                        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <UserRound className="w-3.5 h-3.5" />
                            Scheduled by {meeting.createdBy.name} on {formatMoment(new Date(meeting.createdAt), viewerZone)}
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
