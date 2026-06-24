"use client"

import { Lead } from "@/types/lead"
import { LEAD_STATUS_META } from "@/constants/leadStatus"

interface Props {
    lead: Lead
}

export default function LeadInfoCard({ lead }: Props) {
    const statusMeta = LEAD_STATUS_META[lead.status]

    return (
        <div className="p-5 rounded-2xl shadow-sm border bg-white dark:bg-neutral-900 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Lead Details
                </h2>

                <span
                    className={`text-xs px-2 py-1 rounded-md ${statusMeta.color ?? "bg-gray-500"} text-white`}
                >
                    {statusMeta.label ?? lead.status}
                </span>
            </div>

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <p><strong>Name:</strong> {lead.name}</p>
                <p><strong>Phone:</strong> {lead.phone}</p>
                {lead.email && (
                    <p><strong>Email:</strong> {lead.email}</p>
                )}
                <p><strong>Source:</strong> {lead.source}</p>
            </div>
        </div>
    )
}