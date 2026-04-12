"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import { Client } from "@/types/clients"

export default function ClientInfoCard() {
    const params = useParams()
    const clientId = params.clientId as string

    const [client, setClient] = useState<Client | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchClient() {
            try {
                const res = await fetch(
                    `/api/admin/operations/clients/${clientId}`
                )

                if (!res.ok) throw new Error()

                const data = await res.json()
                setClient(data?.data?.client ?? null)
            } catch {
                setClient(null)
            } finally {
                setLoading(false)
            }
        }

        if (clientId) fetchClient()
    }, [clientId])

    const safe = (value?: string) => value ?? ""

    if (loading) {
        return (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Loading client details...
                </p>
            </div>
        )
    }

    if (!client) {
        return (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
                <p className="text-sm text-red-500">
                    Failed to load client
                </p>
            </div>
        )
    }

    const statusMeta =
        CLIENT_STATUS_META[client.status] ??
        {
            label: "Unknown",
            color: "bg-gray-100 text-gray-600"
        }

    const formattedCreatedAt = client.createdAt
        ? new Date(client.createdAt).toLocaleString()
        : ""

    return (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm hover:shadow-md transition">
            
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                        {safe(client.name)}
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        {safe(client.company)}
                    </p>
                </div>

                <span
                    className={`text-xs px-3 py-1.5 rounded-full font-medium ${statusMeta.color}`}
                >
                    {statusMeta.label}
                </span>
            </div>

            {/* Divider */}
            <div className="my-5 border-t border-neutral-200 dark:border-neutral-800" />

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                
                <div>
                    <p className="text-neutral-400 text-xs mb-1">Email</p>
                    <p className="text-neutral-800 dark:text-neutral-200">
                        {safe(client.email) || "—"}
                    </p>
                </div>

                <div>
                    <p className="text-neutral-400 text-xs mb-1">Phone</p>
                    <p className="text-neutral-800 dark:text-neutral-200">
                        {safe(client.phone) || "—"}
                    </p>
                </div>

                <div className="sm:col-span-2">
                    <p className="text-neutral-400 text-xs mb-1">Created At</p>
                    <p className="text-neutral-800 dark:text-neutral-200">
                        {formattedCreatedAt || "—"}
                    </p>
                </div>
            </div>
        </div>
    )
}