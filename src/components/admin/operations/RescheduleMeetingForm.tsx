"use client"

import { useEffect, useState } from "react"
import { CalendarClock } from "lucide-react"
import { toast } from "sonner"

interface Props {
    meetingId: string
    currentScheduledAt: string
    onCancel: () => void
    onSuccess: () => void
}

/** `new Date()` formatted as YYYY-MM-DDTHH:mm in the user's local TZ. */
function nowLocalDatetime(): string {
    const d = new Date()
    const offset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

/** ISO date → YYYY-MM-DDTHH:mm in local time, for prefilling the input. */
function isoToLocalDatetime(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    const offset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - offset).toISOString().slice(0, 16)
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
    onCancel,
    onSuccess,
}: Props) {
    const minDatetime = nowLocalDatetime()

    const [scheduledAt, setScheduledAt] = useState(
        isoToLocalDatetime(currentScheduledAt)
    )
    const [reason, setReason] = useState("")
    const [submitting, setSubmitting] = useState(false)

    // Re-init when the underlying meeting changes (rare; cheap).
    useEffect(() => {
        setScheduledAt(isoToLocalDatetime(currentScheduledAt))
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

        const newDate = new Date(scheduledAt)
        if (isNaN(newDate.getTime())) {
            toast.error("Invalid date")
            return
        }
        if (newDate.getTime() <= Date.now()) {
            toast.error("New time must be in the future")
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
                        scheduledAt: newDate.toISOString(),
                        reason: reason.trim(),
                    }),
                }
            )
            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "Failed to reschedule")
            }
            toast.success(json.message || "Meeting rescheduled")
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

            <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                    New date & time
                </label>
                <input
                    type="datetime-local"
                    className={INPUT}
                    value={scheduledAt}
                    min={minDatetime}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    disabled={submitting}
                />
            </div>

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
