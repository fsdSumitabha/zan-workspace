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
                className="w-full p-2 border rounded"
            />

            {/* Optional Status */}
            <select
                value={status}
                onChange={(e) => setStatus(Number(e.target.value))}
                className="w-full p-2 border rounded"
            >
                <option value="">No status change</option>
                <option value={20}>Contacted</option>
                <option value={40}>Discussion</option>
            </select>

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose}>
                    Cancel
                </button>

                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
                    Save
                </button>
            </div>

        </form>
    )
}