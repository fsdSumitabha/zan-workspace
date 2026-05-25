"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import MeetingCard from "@/components/admin/operations/MeetingCard"
import { Meeting } from "@/types/meeting"
import Pagination from "@/components/admin/operations/Pagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import MeetingFilters from "@/components/admin/operations/MeetingFilters"
import { usePagination } from "@/hooks/usePagination"
import { useSearch } from "@/hooks/useSearch"

interface ApiResponse {
    success: boolean
    data: Meeting[]
    message?: string
    pagination: {
        page: number
        limit: number
        total: number
        /** Meetings API uses `totalPages`. Other list APIs use `pages`. */
        totalPages?: number
        pages?: number
    }
}

const PAGE_SIZE = 10

export default function MeetingsClient() {
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const [accessError, setAccessError] = useState<string | null>(null)
    const { page, setPage } = usePagination()
    const search = useSearch()

    const searchParams = useSearchParams()
    const status = searchParams.get("status") || ""
    const range = searchParams.get("range") || ""
    const entityType = searchParams.get("entityType") || ""

    const fetchMeetings = useCallback(async () => {
        try {
            setLoading(true)
            setAccessError(null)

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            })
            if (search) params.set("search", search)
            if (status) params.set("status", status)
            if (range) params.set("range", range)
            if (entityType) params.set("entityType", entityType)

            const res = await fetch(
                `/api/admin/operations/meetings?${params.toString()}`
            )

            const json: ApiResponse = await res.json()

            if (res.status === 401 || res.status === 403) {
                setAccessError(
                    json?.message ||
                        "You aren't authorized to perform this action."
                )
                setMeetings([])
                return
            }

            if (json.success) {
                setMeetings(json.data)
                setTotalPages(
                    json.pagination?.totalPages ??
                        json.pagination?.pages ??
                        1
                )
            }
        } catch (error) {
            console.error("Failed to fetch meetings", error)
        } finally {
            setLoading(false)
        }
    }, [page, search, status, range, entityType])

    useEffect(() => {
        fetchMeetings()
    }, [fetchMeetings])

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
        <div className="space-y-4">

            {!loading && meetings.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No meetings found
                </div>
            )}

            {!loading &&
                meetings.map((meeting) => (
                    <MeetingCard key={meeting._id} item={meeting} />
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