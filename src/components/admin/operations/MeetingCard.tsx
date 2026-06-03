"use client"

import { useState } from "react"
import Link from "next/link"
import * as Icons from "lucide-react"
import { toast } from "sonner"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"

import { MEETING_STATUS, MEETING_STATUS_META } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import MeetingLinkButton from "@/components/admin/operations/MeetingLinkButton"
import RescheduleMeetingForm from "@/components/admin/operations/RescheduleMeetingForm"
import { getMeetingTemporalStatus } from "@/utils/MeetingTemporalStatus"
import { useAuth } from "@/contexts/AuthContext"
import TemporalBadge from "./TemporalBadge "

/**
 * Roles allowed to reschedule / close (mark missed/completed) a meeting.
 * Mirrors the backend PATCH roles on both reschedule and status routes.
 */
const RESCHEDULE_ROLES = [10, 60, 45, 70]
const CLOSE_ROLES = RESCHEDULE_ROLES

/** Friendly local-time date for the reschedule history rows. */
function fmtDateTime(d: string | Date | undefined): string {
    if (!d) return "—"
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return "—"
    return dt.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    })
}

export default function MeetingCard({
    item,
    onChanged,
}: {
    item: any
    onChanged?: () => void
}) {

    const [expanded, setExpanded] = useState(false)
    const [rescheduleOpen, setRescheduleOpen] = useState(false)
    const [completeOpen, setCompleteOpen] = useState(false)
    const [outcome, setOutcome] = useState("")
    const [submittingComplete, setSubmittingComplete] = useState(false)
    const [markingMissed, setMarkingMissed] = useState(false)
    const [outcomeExpanded, setOutcomeExpanded] = useState(false)

    const submitComplete = async () => {
        const note = outcome.trim()
        if (!note) { toast.error("Please add an outcome note"); return }
        setSubmittingComplete(true)
        try {
            const res = await fetch(`/api/admin/operations/meetings/${meeting._id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: MEETING_STATUS.COMPLETED, outcome: note }),
            })
            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to update status")
            toast.success(json.message || "Meeting marked completed")
            setCompleteOpen(false)
            setOutcome("")
            onChanged?.()
        } catch (err: any) {
            toast.error(err?.message || "Failed to update status")
        } finally {
            setSubmittingComplete(false)
        }
    }

    const { user } = useAuth()
    const canReschedule = !!user && RESCHEDULE_ROLES.includes(user.role)
    const canClose = !!user && CLOSE_ROLES.includes(user.role)

    const Icon = (Icons as any)[item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)] || Icons.Calendar

    const meeting = item

    const agenda: string = meeting.agenda || ""
    const description: string = meeting.description || ""
    const outcomeText: string = meeting.outcome || ""

    const isLongText = agenda.length + description.length > 110
    const clampClass = !expanded && isLongText ? "line-clamp-2" : ""

    const isLongOutcome = outcomeText.length > 140
    const outcomeClampClass = !outcomeExpanded && isLongOutcome ? "line-clamp-3" : ""

    const temporalStatus = getMeetingTemporalStatus(meeting.scheduledAt)
    const isCancelledOrMissed = meeting.status === MEETING_STATUS.CANCELLED || meeting.status === MEETING_STATUS.MISSED
    const isCompleted = meeting.status === MEETING_STATUS.COMPLETED
    const isScheduled = meeting.status === MEETING_STATUS.SCHEDULED || meeting.status === MEETING_STATUS.RESCHEDULED
    const isUpcoming = isScheduled && temporalStatus === "UPCOMING"
    const isToday = isScheduled && temporalStatus === "TODAY"

    const isRescheduled = meeting.status === MEETING_STATUS.RESCHEDULED
    const showCancel = isScheduled && canClose
    const showComplete = isScheduled && canClose && temporalStatus === "PAST"

    const markCancelled = async () => {
        if (markingMissed) return
        setMarkingMissed(true)
        try {
            const res = await fetch(`/api/admin/operations/meetings/${meeting._id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: MEETING_STATUS.CANCELLED }),
            })
            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to cancel meeting")
            toast.success(json.message || "Meeting cancelled")
            onChanged?.()
        } catch (err: any) {
            toast.error(err?.message || "Failed to cancel meeting")
        } finally {
            setMarkingMissed(false)
        }
    }
    // Rescheduled wins over the green/red temporal dot so the state is
    // immediately visible.
    const dotColor: "green" | "red" | "orange" | null = isRescheduled
        ? "orange"
        : isUpcoming || isToday
          ? "green"
          : isScheduled && temporalStatus === "PAST"
            ? "red"
            : null

    // Dynamic entity route
    const entityHref = `/admin//operations/${meeting.entity?.label?.toLowerCase()}s/${meeting.entityId}`

    return (
        <div className={`relative flex gap-3 p-4 rounded-lg dark:rounded-xl bg-white dark:bg-neutral-900 shadow transition break-words border hover:border-neutral-400 hover:shadow-md ${isCancelledOrMissed ? "border-red-500 opacity-70" : isCompleted ? "border-green-500 opacity-80" : isToday ? "border-emerald-500" : isUpcoming ? "border-blue-500" : "border-slate-200 dark:border-neutral-800"}`}>
            
            {dotColor && (
                <span className="absolute flex h-2 w-2">
                    <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            dotColor === "green"
                                ? "bg-green-400"
                                : dotColor === "red"
                                  ? "bg-red-400"
                                  : "bg-orange-400"
                        }`}
                    ></span>
                    <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                            dotColor === "green"
                                ? "bg-green-500"
                                : dotColor === "red"
                                  ? "bg-red-500"
                                  : "bg-orange-500"
                        }`}
                    ></span>
                </span>
            )}

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">

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

                {/* Attendees (populated subset from the API: _id, name, …) */}
                {Array.isArray(meeting.attendees) &&
                    meeting.attendees.length > 0 &&
                    typeof meeting.attendees[0] === "object" && (
                        <div className="flex items-center gap-1.5 flex-wrap text-xs text-neutral-600 dark:text-neutral-400">
                            <Icons.Users className="w-3 h-3 text-neutral-400" />
                            {meeting.attendees.map(
                                (a: any) => (
                                    <span
                                        key={a._id}
                                        className="px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[11px] text-neutral-700 dark:text-neutral-200"
                                        title={a.email || a.name}
                                    >
                                        {a.name}
                                    </span>
                                )
                            )}
                        </div>
                    )}

                {/* Agenda */}
                {agenda && (
                    <p className={`text-sm text-gray-600 dark:text-gray-400 break-all ${clampClass}`}>
                        Agenda: {agenda}
                    </p>
                )}

                {/* Description */}
                {description && (
                    <p className={`text-sm text-gray-500 break-all ${clampClass}`}>
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

                {/* Reschedule history — most recent last */}
                {Array.isArray(meeting.rescheduleHistory) &&
                    meeting.rescheduleHistory.length > 0 && (
                        <div className="mt-1 rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-2.5 space-y-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                <Icons.CalendarClock className="w-3 h-3" />
                                Rescheduled
                                <span className="text-amber-600/80 dark:text-amber-400/80 font-normal">
                                    ({meeting.rescheduleHistory.length})
                                </span>
                            </div>

                            {meeting.rescheduleHistory.map(
                                (entry: any, i: number) => (
                                    <div
                                        key={entry._id || i}
                                        className="text-xs text-neutral-700 dark:text-neutral-300"
                                    >
                                        <div className="flex  justify-start items-center gap-1.5">
                                            
                                            <div className="line-through text-neutral-500 dark:text-neutral-500">
                                                {fmtDateTime(entry.oldDate)}
                                            </div>
                                               {entry.reason && (
                                            <p className="mt-0.5 italic text-neutral-600 dark:text-neutral-500">
                                               | &ldquo;{entry.reason}&rdquo;
                                            </p>
                                        )}
                                        </div>
                                        
                                    </div>
                                )
                            )}
                        </div>
                    )}

                {/* Meta */}
                <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-gray-500 pt-1">

                    {/* Left */}
                    <div className="flex items-center gap-1">
                        Scheduled: <TimeAgo date={meeting.scheduledAt} />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {showCancel && !completeOpen && (
                            <button type="button" onClick={markCancelled} disabled={markingMissed} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50">
                                <Icons.XCircle className="w-3 h-3" />
                                {markingMissed ? "Cancelling…" : "Cancel"}
                            </button>
                        )}
                        {showComplete && !completeOpen && (
                            <button type="button" onClick={() => setCompleteOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition">
                                <Icons.CheckCircle2 className="w-3 h-3" />
                                Completed
                            </button>
                        )}
                        {canReschedule && isScheduled && !rescheduleOpen && (
                            <button type="button" onClick={() => setRescheduleOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition">
                                <Icons.CalendarClock className="w-3 h-3" />
                                Reschedule
                            </button>
                        )}
                        {meeting.meetingType === MEETING_TYPE.ONLINE && meeting.meetingLink && isScheduled && (
                            <MeetingLinkButton link={meeting.meetingLink} />
                        )}
                    </div>
                </div>

                {/* Inline reschedule form (replaces the prior modal) */}
                {rescheduleOpen && (
                    <RescheduleMeetingForm
                        meetingId={String(meeting._id)}
                        currentScheduledAt={meeting.scheduledAt}
                        onCancel={() => setRescheduleOpen(false)}
                        onSuccess={() => {
                            setRescheduleOpen(false)
                            onChanged?.()
                        }}
                    />
                )}

                {completeOpen && (
                    <div className="mt-2 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5 p-3 space-y-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                            <Icons.CheckCircle2 className="w-3.5 h-3.5" />
                            Mark as completed
                        </div>
                        <textarea
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                            rows={3}
                            placeholder="What was discussed / decided?"
                            disabled={submittingComplete}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none placeholder:text-neutral-400"
                        />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => { setCompleteOpen(false); setOutcome("") }} disabled={submittingComplete} className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50">
                                Cancel
                            </button>
                            <button type="button" onClick={submitComplete} disabled={submittingComplete} className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50">
                                {submittingComplete ? "Saving…" : "Confirm completed"}
                            </button>
                        </div>
                    </div>
                )}

                {isCompleted && outcomeText && (
                    <div className="mt-2 rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
                            <Icons.CheckCircle2 className="w-3 h-3" />
                            Outcome
                        </div>
                        <p className={`text-xs text-neutral-700 dark:text-neutral-300 break-all ${outcomeClampClass}`}>
                            {outcomeText}
                        </p>
                        {isLongOutcome && (
                            <button type="button" onClick={() => setOutcomeExpanded((v) => !v)} className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
                                {outcomeExpanded ? "Read less" : "Read more…"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}