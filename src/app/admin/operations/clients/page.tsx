"use client"

import { useEffect, useState } from "react"
import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import { Client } from "@/types/clients"
import ClientCard from "@/components/admin/operations/ClientCard"
import ClientCardSkeleton from "@/components/admin/operations/skeletons/ClientCardSkeleton"

interface ApiResponse {
    success: boolean
    data: Client[]
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

export default function Page() {
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)

    const fetchClients = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                "/api/admin/operations/clients?page=1&limit=10"
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setClients(json.data)
            }
        } catch (error) {
            console.error("Failed to fetch leads", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchClients()
    }, [])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                {/* LEFT SIDE */}
                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading Skeleton */}
                    {loading && (
                        <div className="space-y-4">
                            {loading &&
                                Array.from({ length: 5 }).map((_, i) => (
                                    <ClientCardSkeleton key={i} />
                                ))}
                        </div>
                    )}

                    {/* Clients List */}
                    {!loading && clients.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            No clients found
                        </div>
                    )}

                    {!loading &&
                        clients.map((client) => (
                            <ClientCard
                                key={client._id}
                                id={client._id}
                                name={client.name}
                                company={client.company}
                                email={client.email}
                                phone={client.phone}
                                createdAt={client.createdAt}
                                status={client.status}
                            />
                        ))}
                </div>

                {/* RIGHT SIDE */}
                <StatsPanel />
            </div>
        </div>
    )
}