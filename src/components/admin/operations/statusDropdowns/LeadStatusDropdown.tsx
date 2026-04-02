"use client"

import { useState, useEffect } from "react"
import { LEAD_STATUS_META, type LeadStatus } from "@/constants/leadStatus"
import clsx from "clsx"
import { toast } from "sonner"

type Props = {
    currentStatus: LeadStatus
    onChange: (status: LeadStatus) => Promise<{ message?: string }>
}

export default function LeadStatusDropdown({ currentStatus, onChange }: Props) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null)

    //  Async lifecycle lives here — not inside the toast
    useEffect(() => {
        if (pendingStatus === null) return

        const run = async () => {
            setLoading(true)
            try {
                const res = await onChange(pendingStatus)
                toast.success(res?.message || "Status updated successfully")
            } catch (err: any) {
                toast.error(err?.message || "Failed to update status")
            } finally {
                setLoading(false)
                setPendingStatus(null)
            }
        }

        run()
    }, [pendingStatus])

    const handleSelect = (status: LeadStatus) => {
        if (status === currentStatus || loading) return
        setOpen(false)

        // Toast is purely presentational — no async inside
        toast.custom((t) => (
            <div className="flex items-center p-2 rounded-lg border border-neutral-200 dark:border-neutral-600 justify-between gap-4 w-full backdrop-blur-lg bg-white/30 dark:bg-neutral-800/50">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">Change status</span>
                    <span className="text-xs text-neutral-400">
                        Move to "{LEAD_STATUS_META[status].label}"
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => toast.dismiss(t)}
                        className="text-xs px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-800"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={() => {
                            toast.dismiss(t)         // 1. close toast
                            setPendingStatus(status) // 2. trigger useEffect
                        }}
                        className="text-xs px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        ))
    }

    return (
        <div className="relative inline-block">
            <button
                onClick={() => !loading && setOpen((prev) => !prev)}
                disabled={loading}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition",
                    LEAD_STATUS_META[currentStatus].color,
                    loading ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"
                )}
            >
                {loading ? "Updating..." : LEAD_STATUS_META[currentStatus].label}
            </button>

            {open && !loading && (
                <div className="absolute mt-2 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden">
                    {Object.entries(LEAD_STATUS_META).map(([key, meta]) => {
                        const status = Number(key) as LeadStatus
                        const isActive = status === currentStatus

                        return (
                            <button
                                key={status}
                                onClick={() => handleSelect(status)}
                                className={clsx(
                                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between transition",
                                    "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                    isActive && "opacity-50 cursor-default"
                                )}
                            >
                                <span>{meta.label}</span>
                                {isActive && (
                                    <span className="text-xs text-neutral-500">Current</span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}