"use client"

import { useEffect, useState } from "react"
import { LEAD_STATUS, LEAD_STATUS_META, type LeadStatus } from "@/constants/leadStatus"
import clsx from "clsx"

const STATUS_ORDER: LeadStatus[] = [
    LEAD_STATUS.NEW,
    LEAD_STATUS.CONTACTED,
    LEAD_STATUS.MEETING,
    LEAD_STATUS.DISCUSSION,
    LEAD_STATUS.NEGOTIATION,
    LEAD_STATUS.CONVERTED
]

type Props = {
    currentStatus: LeadStatus
    onChange: (status: LeadStatus) => Promise<void> | void
}

export default function LeadStatusSlider({ currentStatus, onChange }: Props) {
    const [activeStatus, setActiveStatus] = useState(currentStatus)
    const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        setActiveStatus(currentStatus)
    }, [currentStatus])

    const currentIndex = STATUS_ORDER.indexOf(activeStatus)
    const pendingIndex = pendingStatus !== null ? STATUS_ORDER.indexOf(pendingStatus) : null

    const handleSelect = (status: LeadStatus) => {
        if (loading) return
        if (status === activeStatus) return

        setPendingStatus(status)
    }

    const handleConfirm = async () => {
        if (pendingStatus === null) return

        try {
            setLoading(true)
            await onChange(pendingStatus)
            setActiveStatus(pendingStatus)
            setPendingStatus(null)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleCancel = () => {
        setPendingStatus(null)
    }

    const progressIndex = pendingIndex ?? currentIndex

    return (
        <div className="space-y-16 border px-4 py-6 rounded-xl bg-white dark:bg-neutral-900 dark:border-neutral-700">
            {/* Progress Bar */}
            <div className="relative">
                {/* Base line */}
                <div className="h-1 bg-neutral-200 dark:bg-neutral-800 rounded-full my-6" />

                {/* Animated progress */}
                <div
                    className="absolute top-0 left-0 h-1 bg-blue-500 rounded-full transition-all duration-500"
                    style={{
                        width: `${(progressIndex / (STATUS_ORDER.length - 1)) * 100}%`
                    }}
                />

                {/* Nodes */}
                <div className="absolute top-1/2 left-0 right-0 flex justify-between -translate-y-6 py-4">
                    {STATUS_ORDER.map((status, index) => {
                        const isActive = index <= progressIndex
                        const isPending = pendingStatus === status

                        return (
                            <button
                                key={status}
                                onClick={() => handleSelect(status)}
                                className="relative flex flex-col items-center group"
                            >
                                <div
                                    className={clsx(
                                        "w-4 h-4 rounded-full border-2 transition-all duration-300",
                                        isActive
                                            ? "bg-blue-500 border-blue-500"
                                            : "bg-white dark:bg-neutral-900 border-neutral-400",
                                        isPending && "scale-125 ring-4 ring-blue-200"
                                    )}
                                />

                                <span className="mt-2 text-xs w-16 text-center text-neutral-600 dark:text-neutral-400 group-hover:text-black dark:group-hover:text-white">
                                    {LEAD_STATUS_META[status].label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Inline Confirmation */}
            {pendingStatus !== null && (
                <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2 my-4">
                    <p className="text-sm">
                        Move to{" "}
                        <span className="font-medium">
                            {LEAD_STATUS_META[pendingStatus].label}
                        </span>
                        ?
                    </p>

                    <div className="flex gap-2">
                        <button
                            onClick={handleCancel}
                            className="text-sm px-3 py-1 rounded-md border border-neutral-300 dark:border-neutral-700"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className="text-sm px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? "Updating..." : "Confirm"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}