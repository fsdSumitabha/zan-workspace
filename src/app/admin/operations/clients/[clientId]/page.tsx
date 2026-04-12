"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"

import ClientDetails from "@/components/admin/operations/ClientDetails"
import ClientDetailsSkeleton from "@/components/admin/operations/skeletons/ClientDetailsSkeleton"

import type { Client } from "@/types/clients"
import ClientProjectPreviewCard from "@/components/admin/operations/ClientProjectPreviewCard"

import type { Interaction } from "@/types/interaction"
import LeadInteractionActions from "@/components/admin/operations/LeadInteractionActions"
import InteractionModal from "@/components/admin/operations/InteractionModal/InteractionInlineForm"
import InteractionTimeline from "@/components/admin/operations/interactions/InteractionTimeline"
import { ActionTypeSkeleton } from "@/components/admin/operations/skeletons/ActionTypeSkeleton"
import { InteractionItemSkeleton } from "@/components/admin/operations/skeletons/InteractionItemSkeleton"
import CreateActionButton from "@/components/admin/operations/CreateActionButton"

import { toast } from "sonner"
import { useRouter } from "next/navigation"

export default function Page() {
    const params = useParams()
    const clientId = params.clientId as string

    const [client, setClient] = useState<Client | null>(null)
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [interactionLoading, setInteractionLoading] = useState(true)

    const [activeType, setActiveType] = useState<number | null>(null)
    const [isOpen, setIsOpen] = useState(false)

    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        const fetchClient = async () => {
            try {
                const res = await fetch(`/api/admin/operations/clients/${clientId}`)
                const data = await res.json()

                setClient(data.data.client)
                setProjects(data.data.projects || [])
            } catch (err) {
                console.error("Failed to fetch client", err)
            } finally {
                setLoading(false)
            }
        }

        if (clientId) fetchClient()
    }, [clientId])

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
                `/api/admin/operations/clients/${clientId}/interactions`
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
        if (clientId) fetchInteractions()
    }, [clientId])

    const deleteClient = async () => {
        if (deleting) return

        setDeleting(true)

        try {
            const res = await fetch(`/api/admin/operations/clients/${clientId}`, {
                method: "DELETE"
            })

            const data = await res.json()

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Failed to delete client")
            }

            toast.success("Client deleted successfully")

            router.push("/admin/operations/clients")

        } catch (error: any) {
            toast.error(error.message || "Something went wrong")
        } finally {
            setDeleting(false)
        }
    }
    
    const handleDelete = () => {
        toast("Are you sure you want to delete this lead?", {
            action: {
                label: deleting ? "Deleting..." : "Delete",
                onClick: deleteClient
            },
            cancel: {
                label: "Cancel"
            }
        })
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            <ClientDetailsSkeleton />
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
                    {!loading && client === null && (
                        <div className="text-center py-10 text-gray-500">
                            Client not found
                        </div>
                    )}

                    {/* Data */}
                    {!loading && client && (
                        <>
                            <ClientDetails client={client} />
                            <CreateActionButton href={`${clientId}/projects/create`} label="Create New Lead"/>
                            <LeadInteractionActions leadId={clientId} onAction={handleOpen} activeType={activeType} />
                            <InteractionModal type={activeType} open={isOpen} onClose={handleClose} entityType={1} entityId={clientId} onSuccess={fetchInteractions} />
                        </>
                    )}

                    {!loading && client && (
                        <div className="flex justify-end">
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                            >
                                Delete Client
                            </button>
                        </div>
                    )}

                    {!loading && client && (
                        <InteractionTimeline interactions={interactions} loading={interactionLoading} />
                    )}

                    {!loading && client && (
                        /* ================= PROJECTS ================= */
                        <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">

                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold"> Projects </h3>

                                <Link href={`/admin/operations/clients/${client._id}/projects`} className="text-sm text-blue-500 hover:underline" > View All </Link>
                            </div>

                            {projects?.length === 0 && (
                                <p className="text-sm text-gray-500"> No projects yet </p>
                            )}

                            <div className="space-y-3">
                                {projects?.slice(0, 3).map((project) => (
                                    <ClientProjectPreviewCard key={project._id} project={project} />
                                ))}
                            </div>
                        </div>
                    )}

                    <Link 
                        href={`${clientId}/projects/create`}
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

                <StatsPanel />

            </div>
        </div>
    )
}