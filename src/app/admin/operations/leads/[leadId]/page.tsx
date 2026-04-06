"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import LeadDetails from "@/components/admin/operations/LeadDetails"
import type { Interaction } from "@/types/interaction"

import type { Lead } from "@/types/lead"
import LeadDetailsSkeleton from "@/components/admin/operations/skeletons/LeadDetailsSkeleton"
import LeadInteractionActions from "@/components/admin/operations/LeadInteractionActions"
import InteractionModal from "@/components/admin/operations/InteractionModal/InteractionInlineForm"
import InteractionTimeline from "@/components/admin/operations/interactions/InteractionTimeline"
import { InteractionItemSkeleton } from "@/components/admin/operations/skeletons/InteractionItemSkeleton"
import { ActionTypeSkeleton } from "@/components/admin/operations/skeletons/ActionTypeSkeleton"
import { StatusProvider } from "@/contexts/StatusContext"

export default function Page() {
    const params = useParams()
    const leadId = params.leadId as string

    const [lead, setLead] = useState<Lead | null>(null)
    const [loading, setLoading] = useState(true)

    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [interactionLoading, setInteractionLoading] = useState(true)

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

    const [activeType, setActiveType] = useState<number | null>(null)
    const [isOpen, setIsOpen] = useState(false)

    const handleOpen = (type: number) => {
        setActiveType(type)
        setIsOpen(true)
    }

    const handleClose = () => {
        setIsOpen(false)
        setActiveType(null)
    }

    const fetchInteractions = async () => {
        try {
            const res = await fetch(
                `/api/admin/operations/leads/${leadId}/interactions`
            )
            const data = await res.json()

            setInteractions(data.interactions || [])
        } catch (err) {
            console.error("Failed to fetch interactions", err)
        } finally {
            setInteractionLoading(false)
        }
    }

    useEffect(() => {
        if (leadId) fetchInteractions()
    }, [leadId])

    return (
        <StatusProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            <LeadDetailsSkeleton />
                            <ActionTypeSkeleton />
                            <div className="relative pl-6">
                                <div className="space-y-4">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <InteractionItemSkeleton key={i} />
                                    ))}
                                </div>
                            </div>
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
                        <>
                            <LeadDetails lead={lead} />
                            <LeadInteractionActions leadId={leadId} onAction={handleOpen} activeType={activeType} />
                        </>
                    )}

                    <InteractionModal type={activeType} open={isOpen} onClose={handleClose} leadId={leadId} onSuccess={fetchInteractions} />

                    {!loading && lead && (
                        <InteractionTimeline interactions={interactions} loading={interactionLoading} />
                    )}

                </div>

                <StatsPanel />

            </div>

        </div>
        </StatusProvider>
    )
}