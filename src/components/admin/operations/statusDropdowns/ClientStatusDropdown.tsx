"use client"

import { useState } from "react"
import { CLIENT_STATUS, CLIENT_STATUS_META, type ClientStatus } from "@/constants/clientStatus"
import clsx from "clsx"

type Props = {
    currentStatus: ClientStatus
    onSelect: (status: ClientStatus) => void
}

export default function ClientStatusDropdown({ currentStatus, onSelect }: Props) {
    const [open, setOpen] = useState(false)

    const isTerminal = currentStatus === CLIENT_STATUS.COMPLETED

    const handleSelect = (status: ClientStatus) => {
        if (status === currentStatus) return
        setOpen(false)
        onSelect(status)   // just bubble up, ClientDetails handles the rest
    }

    return (
        <div className="relative inline-block">
            <button
                onClick={() => !isTerminal && setOpen((prev) => !prev)}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition hover:opacity-90",
                    CLIENT_STATUS_META[currentStatus].color
                )}
            >
                {CLIENT_STATUS_META[currentStatus].label}
            </button>

            {open && (
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
                                    isActive && "bg-neutral-100 dark:bg-neutral-800"
                                )}
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm">{meta.label}</span>
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