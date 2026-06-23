"use client"

import { useState } from "react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"
import * as Icons from "lucide-react"
import { STATUS_META_BY_ENTITY } from "@/constants/statusMetaByEntity"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/constants/userRoles"
import EditHistory from "../EditHistory"
import InteractionEditor from "../InteractionEditor"
import Tooltip from "@/components/admin/operations/tooltip/Tooltip"


export default function StatusChangeItem({
    entityType,
    item,
    onChanged,
}: {
    entityType: number
    item: any
    onChanged?: () => void
}) {
    const { role } = useAuth()
    const INTERACTION_EDIT_ROLES: UserRole[] = [10, 15, 60, 45, 50, 70]
    const allowed = role !== null && role !== undefined && (INTERACTION_EDIT_ROLES as number[]).includes(role)
    const [editing, setEditing] = useState(false)

    let parsed: { action?: string; from?: number; to?: number } | null = null
    try {
        parsed = JSON.parse(item.title)
    } catch {
        parsed = null
    }

    const statusMeta = STATUS_META_BY_ENTITY[entityType as keyof typeof STATUS_META_BY_ENTITY]
    const fromMeta = parsed?.from !== undefined ? statusMeta?.[parsed.from] : null
    const toMeta = parsed?.to !== undefined ? statusMeta?.[parsed.to] : null

    return (
        <div className="flex group gap-3 p-4 rounded-lg dark:rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icons.ArrowRightLeft className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2 min-w-0">

                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <h3 className="font-semibold text-sm tracking-wide text-gray-700 dark:text-gray-300">
                            Status Changed
                        </h3>
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
                                title="Edit remarks"
                                aria-label="Edit remarks"
                            >
                                <Icons.Pencil className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Status Transition — never editable */}
                {fromMeta && toMeta && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className={`px-2 py-0.5 text-neutral-800 dark:text-neutral-200 ${fromMeta.decoration}`}>
                            {fromMeta.label}
                        </span>
                        <Icons.ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className={`px-2 py-0.5 text-neutral-800 dark:text-neutral-200 ${toMeta.decoration}`}>
                            {toMeta.label}
                        </span>
                    </div>
                )}

                {/* Remarks — editable */}
                {editing ? (
                    <InteractionEditor
                        interactionId={String(item._id)}
                        initialDescription={item.description ?? ""}
                        showTitle={false}
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
            
            {item.createdBy && (
                <Tooltip content={`Created by ${item.createdBy.name} `} />
            )}
        </div>
    )
}
