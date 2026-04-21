// src/components/admin/operations/ClientDetails.tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import StatusBadge from "./StatusBadge"
import ClientStatusDropdown from "./statusDropdowns/ClientStatusDropdown"
import { CLIENT_STATUS_META, type ClientStatus } from "@/constants/clientStatus"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import { Mail, Phone, Building2, Clock, RefreshCw } from "lucide-react"
import type { Client } from "@/types/clients"
import WhatsAppLink from "./button/WhatsAppLink"

interface Props {
    client: Client
    // Page passes this one function — it owns clientId and does the fetch
    onStatusChange?: (status: ClientStatus, remarks: string) => Promise<void>
}

export default function ClientDetails({ client, onStatusChange }: Props) {
    const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null)
    const [remarks, setRemarks] = useState("")
    const [saving, setSaving] = useState(false)

    const handleStatusSelect = (status: ClientStatus) => {
        if (status === client.status) return
        setPendingStatus(status)
        setRemarks("")
    }

    const handleConfirm = async () => {
        if (!remarks.trim()) {
            toast.error("Remarks are required")
            return
        }
        if (!pendingStatus || !onStatusChange) return

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
        <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                        {client.name}
                    </h1>
                    <p className="text-sm text-gray-400 mt-0.5 truncate">
                        {client.company}
                    </p>
                </div>

                {onStatusChange ? (
                    <ClientStatusDropdown
                        currentStatus={client.status}
                        onSelect={handleStatusSelect}   // just signals selection, no API call here
                    />
                ) : (
                    <StatusBadge status={client.status} meta={CLIENT_STATUS_META} />
                )}
            </div>

            {/* Inline remarks — only mounts when a status is pending */}
            {pendingStatus && (
                <>
                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    <div className="space-y-2">
                        <p className="text-sm font-medium">
                            Change to "{CLIENT_STATUS_META[pendingStatus].label}"
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

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {client.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{client.email}</span>
                    </div>
                )}
                {client.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <WhatsAppLink phone={client.phone} />
                    </div>
                )}
                {client.company && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{client.company}</span>
                    </div>
                )}
            </div>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Timestamps */}
            <div className="flex flex-wrap items-center gap-4">
                {client.createdAt && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Joined</span>
                        <TimeAgo date={client.createdAt} />
                    </div>
                )}
                {client.updatedAt && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Updated</span>
                        <TimeAgo date={client.updatedAt} />
                    </div>
                )}
            </div>
        </div>
    )
}