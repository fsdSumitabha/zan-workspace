"use client"

import StatusBadge from "./StatusBadge"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import { Mail, Phone, Building2, Clock, RefreshCw } from "lucide-react"

import type { Client } from "@/types/clients"

interface Props {
    client: Client
}

export default function ClientDetails({ client }: Props) {
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

                <StatusBadge status={client.status} meta={CLIENT_STATUS_META} />
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Contact + Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                {client.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{client.email}</span>
                    </div>
                )}

                {client.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>{client.phone}</span>
                    </div>
                )}

                {client.company && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{client.company}</span>
                    </div>
                )}

            </div>

            {/* Divider */}
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