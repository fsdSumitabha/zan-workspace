"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Lead } from "@/types/lead"
import LeadCard from "@/components/admin/operations/LeadCard"
import LeadCardSkeleton from "@/components/admin/operations/skeletons/LeadCardSkeleton"
import CreateActionButton from "@/components/admin/operations/CreateActionButton"
import Pagination from "@/components/admin/operations/Pagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { usePagination } from "@/hooks/usePagination"
import { useSearch } from "@/hooks/useSearch"

interface ApiResponse {
    success: boolean
    data: Lead[]
    message?: string
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

const PAGE_SIZE = 10

export default function LeadsClient() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const [accessError, setAccessError] = useState<string | null>(null)
    const { page, setPage } = usePagination()
    const search = useSearch()

    const fetchLeads = useCallback(async () => {
        try {
            setLoading(true)
            setAccessError(null)

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            })
            if (search) params.set("search", search)

            const res = await fetch(
                `/api/admin/operations/leads?${params.toString()}`
            )

            const json: ApiResponse = await res.json()

            if (res.status === 401 || res.status === 403) {
                setAccessError(
                    json?.message ||
                        "You aren't authorized to perform this action."
                )
                setLeads([])
                return
            }

            if (json.success) {
                setLeads(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
            }
        } catch (error) {
            console.error("Failed to fetch leads", error)
        } finally {
            setLoading(false)
        }
    }, [page, search])

    useEffect(() => {
        fetchLeads()
    }, [fetchLeads])

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
        <div className="space-y-4">
            <CreateActionButton href="leads/create" label="Create New Lead" />

            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <LeadCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {!loading && leads.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No leads found
                </div>
            )}

            {!loading &&
                leads.map((lead) => (
                    <LeadCard
                        key={lead._id}
                        id={lead._id}
                        name={lead.name}
                        email={lead.email}
                        phone={lead.phone}
                        source={lead.source}
                        createdAt={lead.createdAt}
                        status={lead.status}
                        createdBy={lead.createdBy}
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

            <Link
                href={"leads/create"}
                className="
                    fixed bottom-6 right-6
                    h-14 w-14 rounded-full
                    bg-blue-600 hover:bg-blue-500
                    text-white
                    flex items-center justify-center
                    shadow-lg hover:shadow-xl
                    transition
                "
            >
                <Plus size={22} />
            </Link>
        </div>
    )
}