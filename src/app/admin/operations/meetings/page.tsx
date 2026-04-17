"use client"

import { useEffect, useState } from "react"
import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import MeetingCard from "@/components/admin/operations/MeetingCard"
import { Meeting } from "@/types/meeting"


interface ApiResponse {
    success: boolean
    data: Meeting[]
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

export default function Page() {
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [loading, setLoading] = useState(true)

    const fetchMeetings = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                "/api/admin/operations/meetings?page=1&limit=10"
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setMeetings(json.data)
            }
        } catch (error) {
            console.error("Failed to fetch meetings", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchMeetings()
    }, [])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                {/* LEFT SIDE */}
                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />


                    {/* Leads List */}
                    {!loading && meetings.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            No meetings found
                        </div>
                    )}

                    {!loading &&
                        meetings.map((meeting) => (
                            <MeetingCard key={meeting._id} item={meeting} />
                        ))}

                </div>

                {/* RIGHT SIDE */}
                <StatsPanel />
            </div>
        </div>
    )
}