import StatusBadge from "@/components/admin/operations/StatusBadge"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import type { Lead } from "@/types/lead"

interface Props {
    lead: Lead
}

export default function LeadDetails({ lead }: Props) {

    return (
        <div className="p-5 rounded-xl border bg-white dark:bg-neutral-900 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">{lead.name}</h2>
                    <p className="text-sm text-gray-500">{lead.source}</p>
                </div>

                <StatusBadge status={lead.status} meta={LEAD_STATUS_META} />
            </div>

            {/* Contact Info */}
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-gray-500">Phone</p>
                    <p>{lead.phone}</p>
                </div>

                {lead.email && (
                    <div>
                        <p className="text-gray-500">Email</p>
                        <p>{lead.email}</p>
                    </div>
                )}
            </div>

            {/* Meta Info */}
            <div className="text-xs text-gray-400">
                Created: {new Date(lead.createdAt).toLocaleString()}
            </div>

        </div>
    )
}