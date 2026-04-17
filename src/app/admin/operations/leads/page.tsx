"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { Lead } from "@/types/lead"
import LeadCard from "@/components/admin/operations/LeadCard"
import LeadCardSkeleton from "@/components/admin/operations/skeletons/LeadCardSkeleton"
import CreateActionButton from "@/components/admin/operations/CreateActionButton"

interface ApiResponse {
    success: boolean
    data: Lead[]
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

export default function Page() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)

    const fetchLeads = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                "/api/admin/operations/leads?page=1&limit=10"
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setLeads(json.data)
            }
        } catch (error) {
            console.error("Failed to fetch leads", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchLeads()
    }, [])

    return (

                <div className="">

                    <CreateActionButton href="leads/create" label="Create New Lead"/>

                    {/* Loading Skeleton */}
                    {loading && (
                        <div className="space-y-4">
                            {loading &&
                                Array.from({ length: 5 }).map((_, i) => (
                                    <LeadCardSkeleton key={i} />
                                ))}
                        </div>
                    )}

                    {/* Leads List */}
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
                            />
                        ))}

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