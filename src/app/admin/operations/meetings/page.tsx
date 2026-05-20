"use client"

import { useCallback, useEffect, useState } from "react"
import MeetingCard from "@/components/admin/operations/MeetingCard"
import { Meeting } from "@/types/meeting"
import Pagination from "@/components/admin/operations/Pagination"
import { usePagination } from "@/hooks/usePagination"

interface ApiResponse {
    success: boolean
    data: Meeting[]
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

export default function Page() {
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const { page, setPage } = usePagination()

    const fetchMeetings = useCallback(async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/meetings?page=${page}&limit=${PAGE_SIZE}`
            )

            const json: ApiResponse = await res.json()

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
    }, [page])

    useEffect(() => {
        fetchMeetings()
    }, [fetchMeetings])

    return (
                <div className="space-y-4">

                    {/* Meetings List */}
                    {!loading && meetings.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            No meetings found
                        </div>
                    )}

                    {!loading &&
                        meetings.map((meeting) => (
                            <MeetingCard key={meeting._id} item={meeting} />
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
    )
}
