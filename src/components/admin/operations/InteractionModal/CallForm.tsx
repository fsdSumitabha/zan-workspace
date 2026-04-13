"use client"

import { useState } from "react"
import { toast } from "sonner"

interface Props {
    entityType: number
    entityId: string
    onClose: () => void
    onSuccess?: () => void
}

export default function CallForm({ entityType, entityId, onClose, onSuccess }: Props) {
    const [form, setForm] = useState({
        contactPersonName: "",
        contactPersonPhone: "",
        callTime: new Date().toISOString().slice(0, 16),
        duration: "",
        direction: "0",
        status: "0",
        title: "",
        description: "",
        notes: "",
    })
    const [recording, setRecording] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData()
        formData.append("entityType", String(entityType))
        formData.append("entityId", entityId)
        formData.append("contactPersonName", form.contactPersonName)
        formData.append("contactPersonPhone", form.contactPersonPhone)
        formData.append("callTime", form.callTime)
        formData.append("duration", form.duration || "0")
        formData.append("direction", form.direction)
        formData.append("status", form.status)
        formData.append("title", form.title)
        formData.append("description", form.description)
        formData.append("notes", form.notes)
        if (recording) formData.append("recording", recording)

        const promise = fetch("/api/admin/operations/calls", {
            method: "POST",
            body: formData,
        }).then(async (res) => {
            const data = await res.json()
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to log call")
            }
            return data
        })

        toast.promise(promise, {
            loading: "Saving call details...",
            success: () => {
                onSuccess?.()
                onClose()
                return "Call logged successfully"
            },
            error: (err) => err.message || "Something went wrong",
        })

        try {
            await promise
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-semibold">Log Call</h2>

            {/* Contact */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Contact Name <span className="text-red-500">*</span></label>
                    <input
                        required
                        placeholder="Jane Doe"
                        value={form.contactPersonName}
                        onChange={set("contactPersonName")}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Contact Phone</label>
                    <input
                        required
                        type="tel"
                        placeholder="+91 99999 00000"
                        pattern="[0-9]{10}"
                        value={form.contactPersonPhone}
                        onChange={set("contactPersonPhone")}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                    />
                </div>
            </div>

            {/* Time & Duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Call Time</label>
                    <input
                        required
                        type="datetime-local"
                        value={form.callTime}
                        onChange={set("callTime")}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Duration (minutes)</label>
                    <input
                        required
                        type="number"
                        min="0"
                        placeholder="e.g. 120"
                        value={form.duration}
                        onChange={set("duration")}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                    />
                </div>
            </div>

            {/* Direction & Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Direction</label>
                    <select
                        required
                        value={form.direction}
                        onChange={set("direction")}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                    >
                        <option value="0">Outbound</option>
                        <option value="1">Inbound</option>
                    </select>
                </div>

            </div>

            {/* Title */}
            <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Title</label>
                <input
                    required
                    placeholder="e.g. Follow-up call"
                    value={form.title}
                    onChange={set("title")}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                />
            </div>

            {/* Notes */}
            <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Notes</label>
                <textarea
                    required
                    placeholder="Detailed call notes..."
                    value={form.notes}
                    onChange={set("notes")}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none text-sm"
                    rows={3}
                />
            </div>

            {/* Recording */}
            <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Recording</label>
                <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setRecording(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 dark:file:bg-neutral-700 dark:file:text-gray-200"
                />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:underline"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
                >
                    {loading ? "Saving..." : "Save Call"}
                </button>
            </div>
        </form>
    )
}