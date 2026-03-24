"use client"

import { useState } from "react"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"

export default function CallForm({ leadId, onClose }: any) {
    const [notes, setNotes] = useState("")
    const [status, setStatus] = useState<number | "">("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        await fetch("/api/interactions", {
            method: "POST",
            body: JSON.stringify({
                entityType: 0,
                entityId: leadId,
                type: INTERACTION_TYPE.CALL_MADE,
                description: notes,
                status // optional
            })
        })

        onClose()
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            <h2 className="text-lg font-semibold">Log Call</h2>

            <textarea
                placeholder="Call notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
                    className="px-4 py-2 rounded bg-blue-600 text-white"
                >
                    Save
                </button>
            </div>

        </form>
    )
}