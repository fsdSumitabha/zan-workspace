"use client"

import { CalendarDays, ListChecks, Trash2, UserRoundPlus, X } from "lucide-react"

export type BulkDialog = "status" | "assign" | "day" | "delete"

/**
 * Actions for the selected rows. It floats at the bottom of the screen, above
 * the phone navigation bar, while at least one row is selected.
 *
 * Everyone can set a status on several rows at once, for example five calls
 * in a row that nobody picked up. Assigning, moving to a day and deleting are
 * for managers.
 */
export default function BulkBar({
    count,
    isManager,
    onOpen,
    onClear,
}: {
    count: number
    isManager: boolean
    onOpen: (dialog: BulkDialog) => void
    onClear: () => void
}) {
    if (count === 0) return null

    const button =
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white"

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-3 md:bottom-6">
            <div
                role="toolbar"
                aria-label="Actions for the selected lead sources"
                className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-neutral-900 px-2 py-1.5 text-white shadow-2xl ring-1 ring-white/10 dark:bg-neutral-800"
            >
                <button type="button" onClick={onClear} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Clear the selection">
                    <X className="h-4 w-4" />
                </button>
                <span className="whitespace-nowrap px-1.5 text-sm font-semibold tabular-nums">{count} selected</span>
                <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />

                <button type="button" onClick={() => onOpen("status")} className={button}>
                    <ListChecks className="h-4 w-4" />
                    <span className="hidden sm:inline">Status</span>
                </button>

                {isManager && (
                    <>
                        <button type="button" onClick={() => onOpen("assign")} className={button}>
                            <UserRoundPlus className="h-4 w-4" />
                            <span className="hidden sm:inline">Assign</span>
                        </button>
                        <button type="button" onClick={() => onOpen("day")} className={button}>
                            <CalendarDays className="h-4 w-4" />
                            <span className="hidden sm:inline">Day</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpen("delete")}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Delete</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
