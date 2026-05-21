"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { Client } from "@/types/clients"
import ClientCard from "@/components/admin/operations/ClientCard"
import ClientCardSkeleton from "@/components/admin/operations/skeletons/ClientCardSkeleton"
import Pagination from "@/components/admin/operations/Pagination"
import { usePagination } from "@/hooks/usePagination"

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

const PAGE_SIZE = 10

export default function Page() {
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const { page, setPage } = usePagination()

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/clients?page=${page}&limit=${PAGE_SIZE}`
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setClients(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
            }
        } catch (error) {
            console.error("Failed to fetch clients", error)
        } finally {
            setLoading(false)
        }
    }, [page])

    useEffect(() => {
        fetchClients()
    }, [fetchClients])

    return (
            <Suspense fallback={
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <ClientCardSkeleton key={i} />
                    ))}
                </div>
            }>
                <div className="space-y-4">

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
                                createdBy={client.createdBy}
                            />
                        ))}

                    {/* Pagination */}
                    {!loading && (
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            disabled={loading}
                            onChange={setPage}
                        />
                    )}
                </div>
            </Suspense>
    )
}
