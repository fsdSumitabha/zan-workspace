"use client"

import { useState } from "react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"
import * as Icons from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/constants/userRoles"
import EditHistory from "../EditHistory"
import InteractionEditor from "../InteractionEditor"

export default function NoteItem({ item, onChanged }: { item: any; onChanged?: () => void }) {
    const { role } = useAuth()
    const [editing, setEditing] = useState(false)
    const INTERACTION_EDIT_ROLES: UserRole[] = [10, 60, 45, 50, 70]
    const allowed = role !== null && role !== undefined && (INTERACTION_EDIT_ROLES as number[]).includes(role)
    const Icon =
        (Icons as any)[
            item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)
        ] || Icons.FileText

    return (
        <div className="flex group gap-3 p-4 rounded-lg dark:rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2 min-w-0">

                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {item.title && !editing && (
                            <h3 className="font-semibold text-sm capitalize tracking-wide text-neutral-800 dark:text-neutral-200">
                                {item.title}
                            </h3>
                        )}
                        <StatusBadge status={item.type} meta={INTERACTION_TYPE_META} />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                            <Icons.Calendar className="w-3 h-3" />
                            <TimeAgo date={item.createdAt} />
                        </span>
                        {allowed && !editing && (
                            <button
                                type="button"
                                onClick={() => setEditing(true)}
                                className="text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
                                title="Edit note"
                                aria-label="Edit note"
                            >
                                <Icons.Pencil className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {editing ? (
                    <InteractionEditor
                        interactionId={String(item._id)}
                        initialTitle={item.title ?? ""}
                        initialDescription={item.description ?? ""}
                        showTitle
                        onCancel={() => setEditing(false)}
                        onSaved={() => {
                            setEditing(false)
                            onChanged?.()
                        }}
                    />
                ) : (
                    item.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap break-words">
                            {item.description}
                        </p>
                    )
                )}

                {!editing && (
                    <EditHistory
                        history={item.editHistory}
                        createdBy={item.createdBy}
                        createdAt={item.createdAt}
                    />
                )}
            </div>
        </div>
    )
}