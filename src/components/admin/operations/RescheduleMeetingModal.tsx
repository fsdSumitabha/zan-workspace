"use client"

import { useEffect, useState } from "react"
import { CalendarClock, X } from "lucide-react"
import { toast } from "sonner"

interface Props {
    meetingId: string
    currentScheduledAt: string
    open: boolean
    onClose: () => void
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

export default function RescheduleMeetingModal({
    meetingId,
    currentScheduledAt,
    open,
    onClose,
    onSuccess,
}: Props) {
    const minDatetime = nowLocalDatetime()

    const [scheduledAt, setScheduledAt] = useState("")
    const [reason, setReason] = useState("")
    const [submitting, setSubmitting] = useState(false)

    // Prefill with the current scheduled time each time the modal opens.
    useEffect(() => {
        if (open) {
            setScheduledAt(isoToLocalDatetime(currentScheduledAt))
            setReason("")
        }
    }, [open, currentScheduledAt])

    if (!open) return null

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
            onClose()
        } catch (err: any) {
            toast.error(err?.message || "Failed to reschedule")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget && !submitting) onClose()
            }}
        >
            <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <CalendarClock className="w-4 h-4" />
                        </span>
                        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                            Reschedule meeting
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close"
                        className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                            New date & time
                        </label>
                        <input
                            type="datetime-local"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
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
                            rows={3}
                            placeholder="Why are you rescheduling?"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            disabled={submitting}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                        {submitting ? "Saving…" : "Reschedule"}
                    </button>
                </div>
            </div>
        </div>
    )
}
