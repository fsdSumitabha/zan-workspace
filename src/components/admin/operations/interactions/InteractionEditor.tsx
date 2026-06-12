"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, X } from "lucide-react"

interface Props {
    interactionId: string
    initialTitle?: string
    initialDescription?: string
    showTitle?: boolean
    onCancel: () => void
    onSaved: () => void
}

export default function InteractionEditor({
    interactionId,
    initialTitle = "",
    initialDescription = "",
    showTitle = true,
    onCancel,
    onSaved,
}: Props) {
    const [title, setTitle] = useState(initialTitle)
    const [description, setDescription] = useState(initialDescription)
    const [saving, setSaving] = useState(false)

    const dirty = title.trim() !== initialTitle.trim() || description.trim() !== initialDescription.trim()

    const save = async () => {
        if (!dirty) return
        try {
            setSaving(true)
            const body: Record<string, string> = {}
            if (showTitle && title.trim() !== initialTitle.trim()) body.title = title.trim()
            if (description.trim() !== initialDescription.trim()) body.description = description.trim()

            const res = await fetch(`/api/admin/operations/interactions/${interactionId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok || !json.success) {
                throw new Error(json.message || "Failed to save")
            }
            toast.success("Updated")
            onSaved()
        } catch (e: any) {
            toast.error(e.message || "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-2">
            {showTitle && (
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title"
                    disabled={saving}
                    className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            )}
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Description"
                disabled={saving}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <div className="flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                >
                    <X className="w-3 h-3" />
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || saving}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                </button>
            </div>
        </div>
    )
}