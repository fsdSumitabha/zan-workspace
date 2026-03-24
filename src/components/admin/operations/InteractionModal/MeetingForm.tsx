"use client"

import { useState } from "react"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"

interface Props {
    leadId: string
    onClose: () => void
}

export default function MeetingForm({ leadId, onClose }: Props) {
    const [date, setDate] = useState("")
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!date) return

        try {
            setLoading(true)

            await fetch("/api/interactions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    entityType: 0,
                    entityId: leadId,
                    type: INTERACTION_TYPE.MEETING_SCHEDULED,
                    description: notes,
                    metadata: {
                        scheduledAt: date
                    }
                })
            })

            onClose()
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            <h2 className="text-lg font-semibold">Schedule Meeting</h2>

            <div className="space-y-2">
                <label className="text-sm">Meeting Date & Time</label>
                <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-2 border rounded-lg bg-white dark:bg-neutral-800"
                />
            </div>

            <textarea
                placeholder="Add notes (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2 border rounded-lg bg-white dark:bg-neutral-800"
                rows={3}
            />

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 text-sm"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-purple-600 text-white"
                >
                    {loading ? "Saving..." : "Schedule"}
                </button>
            </div>

        </form>
    )
}