"use client"

import Link from "next/link"
import { ArrowRight, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import ClientDetails from "@/components/admin/operations/ClientDetails"
import ClientDetailsSkeleton from "@/components/admin/operations/skeletons/ClientDetailsSkeleton"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"

import type { Client } from "@/types/clients"
import type { Lead } from "@/types/lead"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import ClientProjectPreviewCard from "@/components/admin/operations/ClientProjectPreviewCard"

import type { Interaction } from "@/types/interaction"
import LeadInteractionActions from "@/components/admin/operations/LeadInteractionActions"
import InteractionModal from "@/components/admin/operations/InteractionModal/InteractionInlineForm"
import InteractionTimeline from "@/components/admin/operations/interactions/InteractionTimeline"
import { ActionTypeSkeleton } from "@/components/admin/operations/skeletons/ActionTypeSkeleton"
import { InteractionItemSkeleton } from "@/components/admin/operations/skeletons/InteractionItemSkeleton"
import CreateActionButton from "@/components/admin/operations/CreateActionButton"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { handleAuthError } from "@/lib/auth/handleAuthError"

import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ClientStatus } from "@/constants/clientStatus"
import { InteractionType } from "@/constants/interactionTypes"


export default function Page() {
    const params = useParams()
    const clientId = params.clientId as string

    const [client, setClient] = useState<Client | null>(null)
    const [lead, setLead] = useState<Lead | null>(null)
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [interactionLoading, setInteractionLoading] = useState(true)

    const [activeType, setActiveType] = useState<InteractionType | null>(null)
    const [isOpen, setIsOpen] = useState(false)

    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        const fetchClient = async () => {
            try {
                const res = await fetch(`/api/admin/operations/clients/${clientId}`)
                const data = await res.json().catch(() => null)

                if (handleAuthError(res, data, router, setAccessError)) {
                    return
                }

                setClient(data?.data?.client ?? null)
                setLead(data?.data?.lead ?? null)
                setProjects(data?.data?.projects || [])
            } catch (err) {
                console.error("Failed to fetch client", err)
            } finally {
                setLoading(false)
            }
        }

        if (clientId) fetchClient()
    }, [clientId, router])

    const handleOpen = (type: number) => {
        setActiveType(type as InteractionType)
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
                label: "Cancel",
                onClick: () => { }
            }
        })
    }

    const handleStatusChange = async (status: ClientStatus, remarks: string) => {
        const res = await fetch(`/api/admin/operations/clients/${clientId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, remarks }),
        })
        if (!res.ok) throw new Error("Failed to update status")

        toast.success("Status updated")
        // refresh client
        const updated = await fetch(`/api/admin/operations/clients/${clientId}`)
        const data = await updated.json()
        setClient(data.data.client)
    }

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
                <div className="space-y-2">

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
                        
                            <ClientDetails client={client} onStatusChange={handleStatusChange} />

                            {lead && (
                                <div className="p-5  rounded-b-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-2">
                                            <ArrowRight className="w-4 h-4 text-blue-500" />
                                            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                                Converted from Lead
                                            </h3>
                                        </div>
                                        <Link
                                            href={`/admin/operations/leads/${lead._id}`}
                                            className="text-xs text-blue-500 hover:underline"
                                        >
                                            View lead
                                        </Link>
                                    </div>

                                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div>
                                            <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                Source
                                            </dt>
                                            <dd className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100 capitalize">
                                                {lead.source || "—"}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                Lead status
                                            </dt>
                                            <dd className="mt-1">
                                                <span
                                                    className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                                                        LEAD_STATUS_META[lead.status]?.color ||
                                                        "bg-neutral-300 text-neutral-800"
                                                    }`}
                                                >
                                                    {LEAD_STATUS_META[lead.status]?.label || "—"}
                                                </span>
                                            </dd>
                                        </div>

                                        <div>
                                            <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                Captured
                                            </dt>
                                            <dd className="mt-1">
                                                <TimeAgo date={lead.createdAt} />
                                            </dd>
                                        </div>

                                        <div>
                                            <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                Converted
                                            </dt>
                                            <dd className="mt-1">
                                                <TimeAgo date={client.createdAt} />
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            )}

                            <CreateActionButton href={`${clientId}/projects/create`} label="Create New Project" />
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
                        <InteractionTimeline entityType={1} interactions={interactions} loading={interactionLoading} onChanged={fetchInteractions} />
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
    )
}