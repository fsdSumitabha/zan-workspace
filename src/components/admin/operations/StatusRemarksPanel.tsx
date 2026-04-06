"use client"

import { useState } from "react"
import { useStatus } from "@/contexts/StatusContext"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { toast } from "sonner"

type Props = {
    onConfirm: (status: number, remarks: string) => Promise<any>
}

export default function StatusRemarksPanel({ onConfirm }: Props) {
    const {
        remarks,
        setRemarks,
        nextStatus,
        showRemarks,
        setShowRemarks,
        reset
    } = useStatus()

    const [loading, setLoading] = useState(false)

    if (!showRemarks || !nextStatus) return null

    const handleContinue = () => {
        if (!remarks.trim()) {
            toast.error("Remarks are required")
            return
        }

        toast.custom((t) => (
            <div className="flex flex-col gap-3 p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-600 transition min-w-sm w-full">
                <div>
                    <div className="text-sm font-medium">Confirm status change</div>

                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Move to "{LEAD_STATUS_META[nextStatus].label}"
                    </div>

                    <div className="text-xs mt-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded">
                        {remarks}
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => toast.dismiss(t)}
                        className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition rounded"
                    >
                        Edit
                    </button>

                    <button
                        onClick={async () => {
                            toast.dismiss(t)

                            setLoading(true)
                            try {
                                await onConfirm(nextStatus, remarks)
                                reset()
                            } catch (err: any) {
                                toast.error(err?.message || "Failed")
                            } finally {
                                setLoading(false)
                            }
                        }}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        ))
    }

    return (
        <div className="p-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-600 transition w-full">
            <div className="text-sm font-medium">
                Change to "{LEAD_STATUS_META[nextStatus].label}"
            </div>

            <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add remarks (required)"
                className="w-full p-2 text-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition rounded"
            />

            <div className="flex justify-end gap-2 mt-2">
                <button
                    onClick={() => {
                        reset()
                        setShowRemarks(false)
                    }}
                    className="text-xs px-3 py-1 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition rounded"
                >
                    Cancel
                </button>

                <button
                    onClick={handleContinue}
                    disabled={loading}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    Continue
                </button>
            </div>
        </div>
    )
}