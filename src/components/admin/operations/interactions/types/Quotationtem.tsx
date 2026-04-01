"use client"

import * as Icons from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"

export default function QuotationItem({ item }: { item: any }) {

    const quotation = item.quotation

    return (
        <div className="flex gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Icons.FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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

                {/* Description */}
                {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {item.description}
                    </p>
                )}

                {/*  Quotation Details */}
                {quotation && (
                    <div className="mt-2 p-3 rounded-lg border bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between">

                        {/* Left Info */}
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                ₹{quotation.amount.toLocaleString()}
                            </p>

                            {quotation.gst_percentage && (
                                <p className="text-xs text-gray-500">
                                    GST: {quotation.gst_percentage}%
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        {quotation.url && (
                            <a
                                href={quotation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
                            >
                                <Icons.Download className="w-3 h-3" />
                                Download
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}