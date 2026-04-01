"use client"

import { useState } from "react"
import { LEAD_STATUS_META, type LeadStatus } from "@/constants/leadStatus"
import clsx from "clsx"

type Props = {
    currentStatus: LeadStatus
    onChange: (status: LeadStatus) => Promise<void> | void
}

export default function LeadStatusDropdown({
    currentStatus,
    onChange
}: Props) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSelect = async (status: LeadStatus) => {
        if (status === currentStatus) {
            setOpen(false)
            return
        }

        try {
            setLoading(true)
            await onChange(status)
        } catch (err) {
            console.error("Failed to update status", err)
        } finally {
            setLoading(false)
            setOpen(false)
        }
    }

    return (
        <div className="relative inline-block">
            {/* Trigger */}
            <button
                onClick={() => setOpen((prev) => !prev)}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition",
                    LEAD_STATUS_META[currentStatus].color,
                    "hover:opacity-90"
                )}
            >
                {LEAD_STATUS_META[currentStatus].label}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute mt-2 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden">
                    {Object.entries(LEAD_STATUS_META).map(([key, meta]) => {
                        const status = Number(key) as LeadStatus
                        const isActive = status === currentStatus

                        return (
                            <button
                                key={status}
                                onClick={() => handleSelect(status)}
                                disabled={loading}
                                className={clsx(
                                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between transition",
                                    "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                    isActive && "opacity-50 cursor-default"
                                )}
                            >
                                <span>{meta.label}</span>

                                {isActive && (
                                    <span className="text-xs text-neutral-500">
                                        Current
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}