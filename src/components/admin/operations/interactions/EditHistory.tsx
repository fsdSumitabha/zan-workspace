"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, History } from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"

type Person = { _id?: string; name?: string; email?: string } | string | null | undefined

interface EditEntry {
    oldTitle?: string
    oldDescription?: string
    editedBy?: Person
    editedAt: string
}

interface Props {
    history?: EditEntry[]
    createdBy?: Person
    createdAt?: string
}

function personName(p: Person): string {
    if (!p) return "Someone"
    if (typeof p === "string") return "User"
    return p.name || p.email || "User"
}

export default function EditHistory({ history, createdBy, createdAt }: Props) {
    const [open, setOpen] = useState(false)

    if (!history || history.length === 0) return null

    // Most recent first; every entry carries the value it had *before* that edit.
    const entries = [...history].reverse()
    const latest = entries[0]

    return (
        <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-700 dark:text-neutral-300">
                    <History className="w-3 h-3" />
                    <span>
                        Edited by <span className="font-medium">{personName(latest.editedBy)}</span> <TimeAgo date={latest.editedAt} />
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                    <span className="font-medium">{entries.length}</span>
                    {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {open ? "Hide history" : "Show history"}
                </button>
            </div>

            {open && (
                <ul className="mt-2 space-y-2">
                    {entries.map((e, idx) => (
                        <li
                            key={idx}
                            className="text-[11px] text-neutral-500 dark:text-neutral-500 pl-3 border-l border-neutral-200 dark:border-neutral-800"
                        >
                            <div className="flex items-center gap-1.5">
                                <span>
                                    {personName(e.editedBy)} · <TimeAgo date={e.editedAt} />
                                </span>
                            </div>
                            {(e.oldTitle !== undefined || e.oldDescription !== undefined) && (
                                <div className="mt-1 text-neutral-500 dark:text-neutral-500 space-y-0.5">
                                    <div className="opacity-60">Previous value:</div>
                                    {e.oldTitle !== undefined && (
                                        <div className="line-clamp-2"><span className="opacity-60">title:</span> {e.oldTitle || <em>empty</em>}</div>
                                    )}
                                    {e.oldDescription !== undefined && (
                                        <div className="line-clamp-3"><span className="opacity-60">description:</span> {e.oldDescription || <em>empty</em>}</div>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}

                    {createdBy && (
                        <li className="text-[11px] text-neutral-500 dark:text-neutral-500 pl-3 border-l border-neutral-200 dark:border-neutral-800">
                            Created by <span className="font-medium">{personName(createdBy)}</span>
                            {createdAt && <> · <TimeAgo date={createdAt} /></>}
                        </li>
                    )}
                </ul>
            )}
        </div>
    )
}
