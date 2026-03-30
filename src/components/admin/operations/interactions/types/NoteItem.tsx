"use client"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"
import * as Icons from "lucide-react"

export default function NoteItem({ item }: { item: any }) {
    const Icon =
        (Icons as any)[
            item.icon?.charAt(0).toUpperCase() + item.icon?.slice(1)
        ] || Icons.FileText

    return (
        <div className="flex gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">

                        {item.title && (
                            <h3 className="font-semibold text-sm capitalize tracking-wide text-gray-700 dark:text-gray-300">
                                {item.title}
                            </h3>
                        )}

                        <StatusBadge status={item.type} meta={INTERACTION_TYPE_META} />
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={item.createdAt} />
                    </span>
                </div>

                {/* Description */}
                {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {item.description}
                    </p>
                )}

                {/* Optional Footer Meta */}
                {item.updatedAt && (
                    <div className="text-xs text-gray-500 pt-1">
                        Updated: <TimeAgo date={item.updatedAt} />
                    </div>
                )}
            </div>
        </div>
    )
}