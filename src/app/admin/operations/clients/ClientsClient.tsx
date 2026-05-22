"use client"

import { useCallback, useEffect, useState } from "react"
import { Client } from "@/types/clients"
import ClientCard from "@/components/admin/operations/ClientCard"
import ClientCardSkeleton from "@/components/admin/operations/skeletons/ClientCardSkeleton"
import Pagination from "@/components/admin/operations/Pagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { usePagination } from "@/hooks/usePagination"
import { useSearch } from "@/hooks/useSearch"

interface ApiResponse {
    success: boolean
    data: Client[]
    message?: string
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

const PAGE_SIZE = 10

export default function ClientsClient() {
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const [accessError, setAccessError] = useState<string | null>(null)
    const { page, setPage } = usePagination()
    const search = useSearch()

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true)
            setAccessError(null)

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            })
            if (search) params.set("search", search)

            const res = await fetch(
                `/api/admin/operations/clients?${params.toString()}`
            )

            const json: ApiResponse = await res.json()

            if (res.status === 401 || res.status === 403) {
                setAccessError(
                    json?.message ||
                        "You aren't authorized to perform this action."
                )
                setClients([])
                return
            }

            if (json.success) {
                setClients(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
            }
        } catch (error) {
            console.error("Failed to fetch clients", error)
        } finally {
            setLoading(false)
        }
    }, [page, search])

    useEffect(() => {
        fetchClients()
    }, [fetchClients])

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
        <div className="space-y-4">
            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <ClientCardSkeleton key={i} />
                    ))}
                </div>
            )}

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

            {!loading && (
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onChange={setPage}
                />
            )}
        </div>
    )
}