"use client"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"
import * as Icons from "lucide-react"
import { STATUS_META_BY_ENTITY } from "@/constants/statusMetaByEntity"

export default function StatusChangeItem({ entityType, item }: { entityType: number, item: any }) {
    let parsed: {
        action?: string
        from?: number
        to?: number
    } | null = null

    try {
        parsed = JSON.parse(item.title)
    } catch {
        parsed = null
    }

    const statusMeta = STATUS_META_BY_ENTITY[entityType as keyof typeof STATUS_META_BY_ENTITY]

    const fromMeta = parsed?.from !== undefined ? statusMeta?.[parsed.from] : null
console.log("Parsed status change item:", { parsed, fromMeta, toMeta: parsed?.to !== undefined ? statusMeta?.[parsed.to] : null })
    const toMeta = parsed?.to !== undefined ? statusMeta?.[parsed.to] : null

    return (
        <div className="flex group gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <Icons.ArrowRightLeft className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">

                        {/* Title */}
                        <h3 className="font-semibold text-sm tracking-wide text-gray-700 dark:text-gray-300">
                            Status Changed
                        </h3>

                        <StatusBadge
                            status={item.type}
                            meta={INTERACTION_TYPE_META}
                        />
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={item.createdAt} />
                    </span>
                </div>

                {/* Status Transition */}
                {fromMeta && toMeta && (
                    <div className="flex items-center gap-2 text-sm">

                        <span className={`px-2 py-0.5 ${fromMeta.decoration}`}>
                            {fromMeta.label}
                        </span>

                        <Icons.ArrowRight className="w-4 h-4 text-gray-400" />

                        <span className={`px-2 py-0.5 ${toMeta.decoration}`}>
                            {toMeta.label}
                        </span>
                    </div>
                )}

                {/* Remarks */}
                {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {item.description}
                    </p>
                )}

                {/* Footer */}
                {item.updatedAt && (
                    <div className="text-xs text-gray-500 pt-1">
                        Updated: <TimeAgo date={item.updatedAt} />
                    </div>
                )}
            </div>
        </div>
    )
}