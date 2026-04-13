"use client"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import * as Icons from "lucide-react"
import { STATUS_META_BY_ENTITY } from "@/constants/statusMetaByEntity"

interface Props {
    entityType: number
    item: {
        type: number
        title: string
        createdAt: string
        description?: string
        updatedAt?: string
    }
}

export default function StatusChangeItem({ entityType, item }: Props) {

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

    const statusMeta =
        STATUS_META_BY_ENTITY[
            entityType as keyof typeof STATUS_META_BY_ENTITY
        ] ?? {}

    const fromMeta =
        parsed?.from !== undefined ? statusMeta[parsed.from] : null

    const toMeta =
        parsed?.to !== undefined ? statusMeta[parsed.to] : null

    return (
        <div className="mt-3 p-3 rounded-lg border border-neutral-800 bg-white dark:bg-neutral-900">

            <div className="flex items-start gap-3">

                {/* Icon */}
                <div className="mt-1">
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                        <Icons.ArrowRightLeft className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-2">

                    {/* Header */}
                    <div className="flex justify-between items-start">

                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Status Changed
                        </h3>

                        <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Icons.Calendar className="w-3 h-3" />
                            <TimeAgo date={item.createdAt} />
                        </span>
                    </div>

                    {/* Transition */}
                    {fromMeta && toMeta && (
                        <div className="flex items-center gap-2 text-sm">

                            <span className={`px-2 py-0.5 ${fromMeta.decoration || ""}`}>
                                {fromMeta.label}
                            </span>

                            <Icons.ArrowRight className="w-4 h-4 text-gray-400" />

                            <span className={`px-2 py-0.5 ${toMeta.decoration || ""}`}>
                                {toMeta.label}
                            </span>
                        </div>
                    )}

                    {/* Optional Description */}
                    {item.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {item.description}
                        </p>
                    )}

                    {/* Optional Footer */}
                    {item.updatedAt && (
                        <div className="text-xs text-gray-500">
                            Updated: <TimeAgo date={item.updatedAt} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}