"use client"

import { useState } from "react"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { toast } from "sonner";

interface Props {
    entityType: number
    entityId: string
    onClose: () => void
    onSuccess?: () => void
}

export default function NoteForm({ entityType, entityId, onClose, onSuccess }: Props) {
    const [description, setDescription] = useState("")
    const [title, setTitle] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!description.trim()) {
            toast.error("Description cannot be empty");
            return;
        }

        setLoading(true);

        const promise = fetch("/api/admin/operations/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entityType,
                entityId: entityId,
                type: INTERACTION_TYPE.NOTE_ADDED,
                title,
                description
            })
        }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to add note");
            }
            return data;
        });

        toast.promise(promise, {
            loading: "Saving note...",
            success: () => {
                onSuccess?.();
                onClose();
                return "Note added successfully";
            },
            error: (err) => err.message || "Something went wrong"
        });

        try {
            await promise;
        } catch (err) {
            console.error("Error adding note:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            <h2 className="text-lg font-semibold">Add Note</h2>

            <div className="space-y-2">
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    placeholder="write a proper title"
                />
            </div>

            <textarea
                placeholder="Write your note..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 border rounded-lg bg-white dark:bg-neutral-800"
                rows={4}
            />

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-1 text-sm"> Cancel </button>
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