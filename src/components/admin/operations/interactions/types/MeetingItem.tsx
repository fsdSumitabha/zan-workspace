"use client"

import { useState } from "react"
import { toast } from "sonner"
import * as Icons from "lucide-react"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import MeetingLinkButton from "@/components/admin/operations/MeetingLinkButton"
import RescheduleMeetingForm from "@/components/admin/operations/RescheduleMeetingForm"
import { MEETING_STATUS, MEETING_STATUS_META } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import { getMeetingTemporalStatus } from "@/utils/MeetingTemporalStatus"
import { useAuth } from "@/contexts/AuthContext"

const ACTION_ROLES = [10, 60, 45, 70]

export default function MeetingItem({ item, onChanged }: { item: any; onChanged?: () => void }) {
    const meeting = item.meeting
    const { user } = useAuth()
    const canAct = !!user && ACTION_ROLES.includes(user.role)

    const [rescheduleOpen, setRescheduleOpen] = useState(false)
    const [completeOpen, setCompleteOpen] = useState(false)
    const [outcome, setOutcome] = useState("")
    const [submittingComplete, setSubmittingComplete] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [outcomeExpanded, setOutcomeExpanded] = useState(false)

    const Icon = (Icons as any)[item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)] || Icons.Calendar

    const isScheduled = meeting && (meeting.status === MEETING_STATUS.SCHEDULED || meeting.status === MEETING_STATUS.RESCHEDULED)
    const isCompleted = meeting && meeting.status === MEETING_STATUS.COMPLETED
    const temporalStatus = meeting?.scheduledAt ? getMeetingTemporalStatus(meeting.scheduledAt) : null

    const showCancel = isScheduled && canAct && !completeOpen
    const showComplete = isScheduled && canAct && temporalStatus === "PAST" && !completeOpen
    const showReschedule = isScheduled && canAct && !rescheduleOpen

    const outcomeText: string = meeting?.outcome || ""
    const isLongOutcome = outcomeText.length > 140
    const outcomeClampClass = !outcomeExpanded && isLongOutcome ? "line-clamp-3" : ""

    const markCancelled = async () => {
        if (cancelling) return
        setCancelling(true)
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
            setCancelling(false)
        }
    }

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

    return (
        <div className="flex group gap-3 p-4 rounded-lg dark:rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            <div className="flex-1 min-w-0 space-y-2">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-neutral-800 dark:text-neutral-200 text-sm">
                            {item.title}
                        </h3>
                        {meeting?.status && (
                            <StatusBadge status={meeting.status} meta={MEETING_STATUS_META} />
                        )}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap flex gap-2">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={item.createdAt} />
                    </span>
                </div>

                {meeting?.agenda && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">Agenda: {meeting.agenda}</p>
                )}

                {meeting?.description && (
                    <p className="text-sm text-gray-500">{meeting.description}</p>
                )}

                {isCompleted && outcomeText && (
                    <div className="rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 p-2.5">
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

                {meeting && (
                    <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-gray-500 pt-1">
                        <div className="flex items-center gap-1">
                            Scheduled at: <TimeAgo date={meeting.scheduledAt} />
                        </div>

                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            {showCancel && (
                                <button type="button" onClick={markCancelled} disabled={cancelling} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50">
                                    <Icons.XCircle className="w-3 h-3" />
                                    {cancelling ? "Cancelling…" : "Cancel"}
                                </button>
                            )}
                            {showComplete && (
                                <button type="button" onClick={() => setCompleteOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition">
                                    <Icons.CheckCircle2 className="w-3 h-3" />
                                    Completed
                                </button>
                            )}
                            {showReschedule && (
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
                )}

                {rescheduleOpen && meeting && (
                    <RescheduleMeetingForm
                        meetingId={String(meeting._id)}
                        currentScheduledAt={meeting.scheduledAt}
                        onCancel={() => setRescheduleOpen(false)}
                        onSuccess={() => { setRescheduleOpen(false); onChanged?.() }}
                    />
                )}

                {completeOpen && meeting && (
                    <div className="rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5 p-3 space-y-3">
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
            </div>
        </div>
    )
}
