import { useState } from "react"
import { toast } from "sonner"
import { LEAD_STATUS, LEAD_STATUS_META, LeadStatus } from "@/constants/leadStatus"
import type { Lead } from "@/types/lead"
import LeadStatusDropdown from "./statusDropdowns/LeadStatusDropdown"
import ConvertButton from "./ConvertClientButton"
import WhatsAppLink from "./button/WhatsAppLink"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"

/** Roles allowed to edit a Lead. Mirrors the backend PATCH role list. */
const LEAD_EDIT_ROLES = [10, 60, 45, 70]

type Props = {
    lead: Lead
    onStatusChange?: (status: LeadStatus, remarks: string) => Promise<any>
}

export default function LeadDetails({ lead, onStatusChange }: Props) {
    const leadId = lead._id
    const { user } = useAuth()
    const showEdit = !!user && LEAD_EDIT_ROLES.includes(user.role)

    const [pendingStatus, setPendingStatus] = useState<LeadStatus  | null>(null)
    const [remarks, setRemarks] = useState("")
    const [saving, setSaving] = useState(false)

    const handleStatusSelect = (status: LeadStatus) => {
        if (status === lead.status) return
        setPendingStatus(status)
        setRemarks("")
    }

    const handleConfirm = async () => {
        if (!remarks.trim()) {
            toast.error("Remarks are required")
            return
        }
        if (pendingStatus === null || !onStatusChange) return

        setSaving(true)
        try {
            await onStatusChange(pendingStatus, remarks)
            setPendingStatus(null)
            setRemarks("")
        } catch (err: any) {
            toast.error(err?.message || "Failed to update status")
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setPendingStatus(null)
        setRemarks("")
    }

    return (
        <div className="relative p-5 rounded-lg dark:rounded-xl border border-neutral-200 bg-white dark:bg-neutral-900 shadow-sm space-y-4 dark:border-neutral-700">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">{lead.name}</h2>
                    <p className="text-sm text-gray-500">{lead.source}</p>
                </div>

                <div className="flex items-center gap-2">
                    {showEdit && (
                        <Link
                            href={`/admin/operations/leads/${leadId}/edit`}
                            className="text-xs px-3 py-1.5 rounded border border-blue-500/40 text-blue-500 hover:bg-blue-500/10 transition"
                        >
                            Edit
                        </Link>
                    )}
                    <LeadStatusDropdown currentStatus={lead.status} onChange={handleStatusSelect} />
                </div>
            </div>

            <div className="absolute top-1/2 right-4 -translate-y-1/2">
                {lead.status === LEAD_STATUS.NEGOTIATION && <ConvertButton id={leadId} />}
            </div>

            {/* Inline remarks — only mounts when a status is pending */}
            {pendingStatus !== null && (
                <>
                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    <div className="space-y-2">
                        <p className="text-sm font-medium">
                            Change to "{LEAD_STATUS_META[pendingStatus]?.label}"
                        </p>

                        <textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Add remarks (required)"
                            rows={3}
                            className="w-full p-2 text-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={handleCancel}
                                className="text-xs px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={saving}
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                                {saving ? "Saving..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Contact Info */}
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-gray-500">Phone</p>
                    <WhatsAppLink phone={lead.phone} />
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