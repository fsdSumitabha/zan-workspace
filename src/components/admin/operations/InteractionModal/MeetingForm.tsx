"use client"

import { useState } from "react"
import { toast } from "sonner"

interface Props {
    entityId: string
    onClose: () => void
    onSuccess?: () => void
}

export default function MeetingForm({ entityId, onClose, onSuccess }: Props) {
    const [title, setTitle] = useState("")
    const [agenda, setAgenda] = useState("")
    const [description, setDescription] = useState("")
    const [date, setDate] = useState("")
    const [status, setStatus] = useState(2010) // 0: Scheduled, 1: Completed, 2: Cancelled
    const [meetingType, setMeetingType] = useState(0) // 0: ONLINE, 1: OFFLINE
    const [meetingLink, setMeetingLink] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const promise = fetch("/api/admin/operations/meetings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                entityType: 0, // LEAD
                entityId: entityId,
                title,
                agenda,
                description,
                meetingType,
                meetingLink,
                status,
                scheduledAt: date,
                createdBy: "USER_ID"
            })
        }).then(async (res) => {
            const data = await res.json()
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to schedule meeting")
            }
            return data
        })

        toast.promise(promise, {
            loading: "Scheduling meeting...",
            success: () => {
                onSuccess?.()
                onClose()
                return "Meeting scheduled successfully"
            },
            error: (err) => err.message || "Something went wrong"
        })

        try {
            await promise
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            <h2 className="text-lg font-semibold">Schedule Meeting</h2>

            {/* Title */}
            <div className="space-y-2">
                <label className="text-sm">Title</label>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    placeholder="e.g. Discovery Call"
                />
            </div>

            {/* Agenda */}
            <div className="space-y-2">
                <label className="text-sm">Agenda</label>
                <input
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    placeholder="Purpose of the meeting"
                />
            </div>

            {/* Date */}
            <div className="space-y-2">
                <label className="text-sm">Meeting Date & Time</label>
                <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                />
            </div>

            {/* Meeting Type */}
            <div className="space-y-2">
                <label className="text-sm">Meeting Type</label>
                <select
                    value={meetingType}
                    onChange={(e) => setMeetingType(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                >
                    <option value={0}>Online</option>
                    <option value={1}>Offline</option>
                </select>
            </div>

            {/* Meeting Link (only for online) */}
            {meetingType === 0 && (
                <div className="space-y-2">
                    <label className="text-sm">Meeting Link</label>
                    <input
                        value={meetingLink}
                        onChange={(e) => setMeetingLink(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        placeholder="https://..."
                    />
                </div>
            )}

            {/* Description */}
            <textarea
                placeholder="Additional notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
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
                    className="px-4 py-2 rounded bg-purple-600 text-white"
                >
                    {loading ? "Saving..." : "Schedule"}
                </button>
            </div>

        </form>
    )
}