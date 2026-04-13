"use client"

import { useState, useEffect } from "react"
import { CLIENT_STATUS, CLIENT_STATUS_META, type ClientStatus} from "@/constants/clientStatus"
import clsx from "clsx"
import { toast } from "sonner"

type Props = {
    currentStatus: ClientStatus
    onChange: (status: ClientStatus) => Promise<{ message?: string }>
}

export default function ClientStatusDropdown({
    currentStatus,
    onChange
}: Props) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null)

    const isTerminal = currentStatus === CLIENT_STATUS.COMPLETED

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

    const handleSelect = (status: ClientStatus) => {
        if (status === currentStatus || loading) return

        setOpen(false)
        setPendingStatus(status)
    }

    return (
        <div className="relative inline-block">
            <button
                onClick={() => !loading && !isTerminal && setOpen((prev) => !prev)}
                disabled={loading}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition",
                    CLIENT_STATUS_META[currentStatus].color,
                    loading
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:opacity-90"
                )}
            >
                {loading
                    ? "Updating..."
                    : CLIENT_STATUS_META[currentStatus].label}
            </button>

            {open && !loading && (
                <div className="absolute mt-2 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden">
                    {Object.entries(CLIENT_STATUS_META).map(([key, meta]) => {
                        const status = Number(key) as ClientStatus
                        const isActive = status === currentStatus

                        return (
                            <button
                                key={status}
                                onClick={() => handleSelect(status)}
                                className={clsx(
                                    "w-full text-left px-3 py-2 transition",
                                    "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                    isActive &&
                                        "bg-neutral-100 dark:bg-neutral-800"
                                )}
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm">
                                        {meta.label}
                                    </span>
                                    {isActive && (
                                        <span className="text-[11px] text-neutral-500 mt-0.5">
                                            Current
                                        </span>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}