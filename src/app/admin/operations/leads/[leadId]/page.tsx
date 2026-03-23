"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import LeadDetails from "@/components/admin/operations/LeadDetails"

import type { Lead } from "@/types/lead"
import LeadDetailsSkeleton from "@/components/admin/operations/skeletons/LeadDetailsSkeleton"

export default function Page() {
    const params = useParams()
    const leadId = params.leadId as string

    const [lead, setLead] = useState<Lead | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchLead = async () => {
            try {
                const res = await fetch(`/api/admin/operations/leads/${leadId}`)
                const data = await res.json()

                setLead(data.data)
            } catch (err) {
                console.error("Failed to fetch lead", err)
            } finally {
                setLoading(false)
            }
        }

        if (leadId) fetchLead()
    }, [leadId])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            <LeadDetailsSkeleton />
                        </div>
                    )}

                    {/* Empty */}
                    {!loading && lead === null && (
                        <div className="text-center py-10 text-gray-500">
                            Lead not found
                        </div>
                    )}

                    {/* List */}
                    {!loading && lead && (
                        <LeadDetails lead={lead} />
                    )}

                </div>

                <StatsPanel />

            </div>
        </div>
    )
}