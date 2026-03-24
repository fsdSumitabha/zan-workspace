"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"

import ClientDetails from "@/components/admin/operations/ClientDetails"
import ClientDetailsSkeleton from "@/components/admin/operations/skeletons/ClientDetailsSkeleton"

import type { Client } from "@/types/clients"

export default function Page() {
    const params = useParams()
    const clientId = params.clientId as string

    const [client, setClient] = useState<Client | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchClient = async () => {
            try {
                const res = await fetch(`/api/admin/operations/clients/${clientId}`)
                const data = await res.json()

                setClient(data.data)
            } catch (err) {
                console.error("Failed to fetch client", err)
            } finally {
                setLoading(false)
            }
        }

        if (clientId) fetchClient()
    }, [clientId])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            <ClientDetailsSkeleton />
                        </div>
                    )}

                    {/* Empty */}
                    {!loading && client === null && (
                        <div className="text-center py-10 text-gray-500">
                            Client not found
                        </div>
                    )}

                    {/* Data */}
                    {!loading && client && (
                        <ClientDetails client={client} />
                    )}

                </div>

                <StatsPanel />

            </div>
        </div>
    )
}