"use client"

import { useEffect, useState } from "react"
import { CalendarClock } from "lucide-react"
import { toast } from "sonner"
import MeetingWhenField from "@/components/admin/operations/time/MeetingWhenField"
import { showGoogleResult } from "@/components/admin/operations/time/googleToast"

interface Props {
    meetingId: string
    currentScheduledAt: string
    /** The client's zone. Pass meetingZone(meeting). */
    clientZone: string
    /** Online meetings have a Google event, and Google emails the guests. */
    isOnline?: boolean
    onCancel: () => void
    onSuccess: () => void
}

function toDate(iso: string): Date | null {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d
}

const INPUT =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"

/**
 * Inline reschedule form rendered below the meeting card. Replaces the
 * earlier modal so the reschedule UI stays inside the card it relates to.
 */
export default function RescheduleMeetingForm({
    meetingId,
    currentScheduledAt,
    clientZone,
    isOnline = false,
    onCancel,
    onSuccess,
}: Props) {
    // The exact moment picked. The field shows it in the zone the person picks.
    const [scheduledAt, setScheduledAt] = useState<Date | null>(() => toDate(currentScheduledAt))
    const [reason, setReason] = useState("")
    const [submitting, setSubmitting] = useState(false)

    // Re-init when the underlying meeting changes (rare; cheap).
    useEffect(() => {
        setScheduledAt(toDate(currentScheduledAt))
        setReason("")
    }, [currentScheduledAt])

    const submit = async () => {
        if (!scheduledAt) {
            toast.error("Please pick a new date and time")
            return
        }
        if (!reason.trim()) {
            toast.error("Please provide a reason")
            return
        }
        if (scheduledAt.getTime() <= Date.now()) {
            toast.error("New time must be in the future")
            return
        }
        if (scheduledAt.getTime() === new Date(currentScheduledAt).getTime()) {
            toast.error("Pick a time that is different from the current one")
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch(
                `/api/admin/operations/meetings/${meetingId}/reschedule`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        // The exact moment, ending in "Z".
                        scheduledAt: scheduledAt.toISOString(),
                        reason: reason.trim(),
                    }),
                }
            )
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to reschedule")
            }
            showGoogleResult(json.google, {
                done: "Meeting rescheduled",
                googleDone: "Meeting rescheduled. Google emailed the guests the new time.",
            })
            onSuccess()
        } catch (err: any) {
            toast.error(err?.message || "Failed to reschedule")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <CalendarClock className="w-3.5 h-3.5" />
                Reschedule meeting
            </div>

            <MeetingWhenField
                label="New date & time"
                labelClassName="text-[11px] font-medium text-neutral-500 uppercase tracking-wide"
                inputClassName={INPUT}
                value={scheduledAt}
                onChange={setScheduledAt}
                clientZone={clientZone}
                disabled={submitting}
            />

            <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                    Reason
                </label>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Why are you rescheduling?"
                    className={`${INPUT} resize-none placeholder:text-neutral-400`}
                    disabled={submitting}
                />
            </div>

            {isOnline && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    Google Calendar will move the event and email every guest the new time.
                </p>
            )}

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                    {submitting ? "Saving…" : "Confirm"}
                </button>
            </div>
        </div>
    )
}
