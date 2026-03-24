"use client"

import { useState } from "react"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"

interface Props {
    leadId: string
    onClose: () => void
}

export default function NoteForm({ leadId, onClose }: Props) {
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!notes.trim()) return

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
                    type: INTERACTION_TYPE.NOTE_ADDED,
                    description: notes
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

            <h2 className="text-lg font-semibold">Add Note</h2>

            <textarea
                placeholder="Write your note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2 border rounded-lg bg-white dark:bg-neutral-800"
                rows={4}
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
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white"
                >
                    {loading ? "Saving..." : "Save Note"}
                </button>
            </div>

        </form>
    )
}