"use client"

import { useState, useEffect } from "react"
import { LEAD_STATUS, LEAD_STATUS_META, type LeadStatus } from "@/constants/leadStatus"
import clsx from "clsx"
import { toast } from "sonner"
import { Check } from "lucide-react"

type Props = {
    currentStatus: LeadStatus
    onChange: (status: LeadStatus) => void | Promise<{ message?: string } | void>
}

export default function LeadStatusDropdown({ currentStatus, onChange }: Props) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null)

    const isTerminal = currentStatus >= LEAD_STATUS.CONVERTED

    //  Async lifecycle lives here — not inside the toast
    useEffect(() => {
        if (pendingStatus === null) return

        const run = async () => {
            setLoading(true)
            try {
                const res = await onChange(pendingStatus)
                if (res && typeof res === "object" && "message" in res) {
                    toast.success(res.message || "Status updated successfully")
                }
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
        setPendingStatus(status)
    }

    return (
        <div className="relative inline-block">
            <button
                onClick={() => !loading && !isTerminal && setOpen((prev) => !prev)}
                disabled={loading}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    "focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900",
                    LEAD_STATUS_META[currentStatus].color,
                    loading
                        ? "opacity-50 cursor-not-allowed"
                        : isTerminal
                            ? "cursor-default opacity-70"
                            : "hover:opacity-90"
                )}
            >
                {loading ? "Updating..." : LEAD_STATUS_META[currentStatus].label}
            </button>

            {open && !loading && (
                <div
                    role="listbox"
                    className={clsx(
                        "absolute mt-2 w-48 z-50 overflow-hidden p-1 rounded-xl shadow-lg ring-1",
                        "bg-white ring-black/5",
                        "dark:bg-neutral-900 dark:ring-white/10 dark:shadow-black/40"
                    )}
                >
                    {Object.entries(LEAD_STATUS_META)
                        .filter(([key]) => Number(key) !== LEAD_STATUS.CONVERTED)
                        .map(([key, meta]) => {
                            const status = Number(key) as LeadStatus
                            const isActive = status === currentStatus

                            return (
                                <button
                                    key={status}
                                    role="option"
                                    aria-selected={isActive}
                                    onClick={() => handleSelect(status)}
                                    className={clsx(
                                        "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                                        "text-neutral-700 dark:text-neutral-200",
                                        "hover:bg-neutral-100 hover:text-neutral-900",
                                        "dark:hover:bg-neutral-800 dark:hover:text-white",
                                        "focus:outline-none focus-visible:bg-neutral-100 dark:focus-visible:bg-neutral-800",
                                        isActive && [
                                            "bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700",
                                            "dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/15 dark:hover:text-blue-200",
                                        ]
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium leading-tight">{meta.label}</span>
                                        {isActive && (
                                            <span className="text-[11px] mt-0.5 text-blue-600/70 dark:text-blue-300/70">
                                                Current
                                            </span>
                                        )}
                                    </div>

                                    {isActive && (
                                        <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                                    )}
                                </button>
                            )
                        })}
                </div>
            )}
        </div>
    )
}