"use client"

import { useState } from "react"
import { PROJECT_STATUS, PROJECT_STATUS_META, type ProjectStatus } from "@/constants/projectStatus"
import clsx from "clsx"

type Props = {
    currentStatus: ProjectStatus
    onSelect: (status: ProjectStatus) => void
}

export default function ProjectStatusDropdown({
    currentStatus,
    onSelect
}: Props) {
    const [open, setOpen] = useState(false)

    const isTerminal = currentStatus === PROJECT_STATUS.CLOSED

    const handleSelect = (status: ProjectStatus) => {
        if (status === currentStatus) return
        setOpen(false)
        onSelect(status)
    }

    return (
        <div className="relative inline-block">
            <button
                onClick={() => !isTerminal && setOpen((prev) => !prev)}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition hover:opacity-90",
                    PROJECT_STATUS_META[currentStatus].color
                )}
            >
                {PROJECT_STATUS_META[currentStatus].label}
            </button>

            {open && (
                <div className="absolute mt-2 w-52 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden">
                    {Object.entries(PROJECT_STATUS_META).map(([key, meta]) => {
                        const status = Number(key) as ProjectStatus
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