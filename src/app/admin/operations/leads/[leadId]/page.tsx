"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import LeadDetails from "@/components/admin/operations/LeadDetails"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import type { Interaction } from "@/types/interaction"

import type { Lead } from "@/types/lead"
import type { Client } from "@/types/clients"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import LeadDetailsSkeleton from "@/components/admin/operations/skeletons/LeadDetailsSkeleton"
import LeadInteractionActions from "@/components/admin/operations/LeadInteractionActions"
import InteractionModal from "@/components/admin/operations/InteractionModal/InteractionInlineForm"
import InteractionTimeline from "@/components/admin/operations/interactions/InteractionTimeline"
import { InteractionItemSkeleton } from "@/components/admin/operations/skeletons/InteractionItemSkeleton"
import { ActionTypeSkeleton } from "@/components/admin/operations/skeletons/ActionTypeSkeleton"
import { InteractionType } from "@/constants/interactionTypes"
import { useAuth } from "@/contexts/AuthContext"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { handleAuthError } from "@/lib/auth/handleAuthError"

export default function Page() {
    const params = useParams()
    const leadId = params.leadId as string

    const [lead, setLead] = useState<Lead | null>(null)
    const [client, setClient] = useState<Client | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)

    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [interactionLoading, setInteractionLoading] = useState(true)

    const { role } = useAuth()
    const router = useRouter()

    useEffect(() => {
        const fetchLead = async () => {
            try {
                const res = await fetch(`/api/admin/operations/leads/${leadId}`)
                const data = await res.json().catch(() => null)

                if (handleAuthError(res, data, router, setAccessError)) {
                    return
                }

                // API now returns { lead, client } — client is the
                // converted Client doc (or null) when this lead has
                // been converted.
                setLead(data?.data?.lead ?? null)
                setClient(data?.data?.client ?? null)
            } catch (err) {
                console.error("Failed to fetch lead", err)
            } finally {
                setLoading(false)
            }
        }

        if (leadId) fetchLead()
    }, [leadId, router])

    const [activeType, setActiveType] = useState<InteractionType | null>(null)
    const [isOpen, setIsOpen] = useState(false)

    const handleOpen = (type: InteractionType) => {
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

    const handleStatusChange = async (status: number, remarks: string) => {
        const res = await fetch(
            `/api/admin/operations/leads/${leadId}/status`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, remarks })
            }
        )

        const data = await res.json()

        if (!res.ok || !data?.success) {
            throw new Error(data?.message || "Failed to update status")
        }

        toast.success("Status updated")

        // refresh lead (and the converted client, if any)
        const updated = await fetch(`/api/admin/operations/leads/${leadId}`)
        const updatedData = await updated.json()
        setLead(updatedData?.data?.lead ?? null)
        setClient(updatedData?.data?.client ?? null)

        await fetchInteractions()
    }

    const [deleting, setDeleting] = useState(false)

    const deleteLead = async () => {
        if (deleting) return

        setDeleting(true)

        try {
            const res = await fetch(`/api/admin/operations/leads/${leadId}`, {
                method: "DELETE"
            })

            const data = await res.json()

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Failed to delete lead")
            }

            toast.success("Lead deleted successfully")

            router.push("/admin/operations/leads")

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
                onClick: deleteLead
            },
            cancel: {
                label: "Cancel",
                onClick: () => {}
            }
        })
    }

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
                    <div className="lg:col-span-2 space-y-2">

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
                                <LeadDetails lead={lead} onStatusChange={handleStatusChange} />

                                {client && (
                                    <div className="p-5  rounded-b-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <div className="flex items-center gap-2">
                                                <ArrowRight className="w-4 h-4 text-emerald-500" />
                                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                                    Converted to Client
                                                </h3>
                                            </div>
                                            <Link
                                                href={`/admin/operations/clients/${client._id}`}
                                                className="text-xs text-emerald-600 hover:underline"
                                            >
                                                View client
                                            </Link>
                                        </div>

                                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div>
                                                <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                    Name
                                                </dt>
                                                <dd className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                                    {client.name || "—"}
                                                </dd>
                                            </div>

                                            <div>
                                                <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                    Company
                                                </dt>
                                                <dd className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                                    {client.company || "—"}
                                                </dd>
                                            </div>

                                            <div>
                                                <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                                                    Client status
                                                </dt>
                                                <dd className="mt-1">
                                                    <span
                                                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                                                            CLIENT_STATUS_META[client.status]?.color ||
                                                            "bg-neutral-300 text-neutral-800"
                                                        }`}
                                                    >
                                                        {CLIENT_STATUS_META[client.status]?.label || "—"}
                                                    </span>
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

                                <LeadInteractionActions leadId={leadId} onAction={handleOpen} activeType={activeType} />
                            </>
                        )}
                        
                        {!loading && lead && role === 10 && (
                            <div className="flex justify-end">
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                                >
                                    Delete Lead
                                </button>
                            </div>
                        )}

                        <InteractionModal type={activeType} open={isOpen} onClose={handleClose} entityType={0} entityId={leadId} onSuccess={fetchInteractions} />

                        {!loading && lead && (
                            <InteractionTimeline entityType={0} interactions={interactions} loading={interactionLoading} onChanged={fetchInteractions} />
                        )}

                    </div>
    )
}