"use client"

import { useState } from "react"
import { toast } from "sonner"
import type { LeadSourceRow } from "@/types/leadSource"
import { LEAD_SOURCES_API, send } from "./api"
import { FIELD } from "./Dialog"

/** Adds a note without changing the status. Ctrl+Enter saves. */
export default function NoteBox({ sourceId, onAdded }: { sourceId: string; onAdded: (row: LeadSourceRow) => void }) {
    const [text, setText] = useState("")
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (!text.trim() || saving) return
        setSaving(true)
        try {
            const row = await send<LeadSourceRow>(`${LEAD_SOURCES_API}/${sourceId}/notes`, "POST", { text: text.trim() })
            setText("")
            onAdded(row)
            toast.success("Note added")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add the note")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-2">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        save()
                    }
                }}
                rows={3}
                maxLength={2000}
                placeholder="What did you learn on the call?"
                className={`${FIELD} resize-y`}
            />
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">Ctrl+Enter adds the note.</p>
                <button
                    type="button"
                    onClick={save}
                    disabled={!text.trim() || saving}
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? "Adding..." : "Add note"}
                </button>
            </div>
        </div>
    )
}
