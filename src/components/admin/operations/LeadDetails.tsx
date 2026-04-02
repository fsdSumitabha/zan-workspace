import StatusBadge from "@/components/admin/operations/StatusBadge"
import { LEAD_STATUS, LEAD_STATUS_META } from "@/constants/leadStatus"
import type { Lead } from "@/types/lead"
import LeadStatusDropdown from "./statusDropdowns/LeadStatusDropdown"
import ConvertButton from "./ConvertClientButton"

interface Props {
    lead: Lead
}

export default function LeadDetails({ lead }: Props) {
    const leadId = lead._id

    const handleStatusChange = async (status: number) => {
        try {
            const res = await fetch(
                `/api/admin/operations/leads/${leadId}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ status })
                }
            )

            let data: any = null

            try {
                data = await res.json()
            } catch {
                // response not JSON
            }

            if (!res.ok || !data?.success) {
                throw new Error(
                    data?.message || "Failed to update status"
                )
            }

            return data

        } catch (err: any) {
            console.log("Status update failed:", err)

            // IMPORTANT: rethrow so UI can handle it
            throw new Error(
                err?.message || "Something went wrong"
            )
        }
    }

    return (
        <div className="relative p-5 rounded-xl border bg-white dark:bg-neutral-900 space-y-4 dark:border-neutral-700">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">{lead.name}</h2>
                    <p className="text-sm text-gray-500">{lead.source}</p>
                </div>

                <LeadStatusDropdown currentStatus={lead.status} onChange={handleStatusChange} />
            </div>

            <div className="absolute top-1/2 right-4 -translate-y-1/2">
                {lead.status === LEAD_STATUS.NEGOTIATION && <ConvertButton id={leadId} />}
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