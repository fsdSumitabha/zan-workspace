"use client"

import { useState } from "react"
import { toast } from "sonner"
import FileUpload from "../dropzone/FileUpload"

interface Props {
    entityId: string
    entityType?: number
    onClose: () => void
    onSuccess?: () => void
}

export default function QuotationForm({
    entityId,
    entityType = 0,
    onClose,
    onSuccess
}: Props) {

    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [amount, setAmount] = useState("")
    const [status, setStatus] = useState(120) // PROPOSAL_SENT
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!title.trim()) {
            toast.error("Title is required")
            return
        }

        if (!amount) {
            toast.error("Amount is required")
            return
        }

        const formData = new FormData()

        formData.append("entityType", String(entityType))
        formData.append("entityId", entityId)
        formData.append("title", title)
        formData.append("description", description)
        formData.append("amount", amount)
        formData.append("status", String(status))

        if (file) {
            formData.append("file", file)
        }

        setLoading(true)

        const promise = fetch("/api/admin/operations/quotations", {
            method: "POST",
            body: formData
        }).then(async (res) => {
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to create quotation")
            }
            return data
        })

        toast.promise(promise, {
            loading: "Uploading quotation...",
            success: () => {
                onSuccess?.()
                onClose()
                return "Quotation created successfully"
            },
            error: (err) => err.message || "Something went wrong"
        })

        try {
            await promise
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            <h2 className="text-lg font-semibold">Send Quotation</h2>

            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quotation title"
                className="w-full px-3 py-2 rounded-lg border dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />

            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full p-2 border dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800"
                rows={3}
            />

            <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="w-full px-3 py-2 rounded-lg border dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />

            <FileUpload
                file={file}
                setFile={setFile}
                label="Upload Quotation File"
                maxSize={10 * 1024 * 1024}
                acceptedTypes={[
                    "application/pdf",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ]}
            />

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose}>
                    Cancel
                </button>

                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white"
                >
                    {loading ? "Uploading..." : "Send"}
                </button>
            </div>
        </form>
    )
}