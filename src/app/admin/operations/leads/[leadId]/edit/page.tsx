"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import LeadForm from "@/components/admin/operations/LeadForm"

type LeadFormValues = {
    name: string
    email: string
    phone: string
    source: string
}

export default function Page() {
    const params = useParams()
    const leadId = params.leadId as string

    const [loading, setLoading] = useState(true)
    const [lead, setLead] = useState<LeadFormValues | null>(null)

    useEffect(() => {
        const fetchLead = async () => {
            try {
                const res = await fetch(`/api/admin/operations/leads/${leadId}`)
                const data = await res.json()

                if (!res.ok || !data?.success || !data?.data) {
                    throw new Error(data?.message || "Failed to load lead")
                }

                setLead({
                    name: data.data.name || "",
                    email: data.data.email || "",
                    phone: data.data.phone || "",
                    source: data.data.source || ""
                })
            } catch (error: any) {
                toast.error(error.message || "Failed to load lead")
            } finally {
                setLoading(false)
            }
        }

        if (leadId) {
            fetchLead()
        }
    }, [leadId])

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="p-5 rounded-lg dark:rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                    Loading lead details...
                </div>
            </div>
        )
    }

    if (!lead) {
        return (
            <div className="space-y-4">
                <div className="p-5 rounded-lg dark:rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-red-500">
                    Lead not found
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <LeadForm mode="edit" leadId={leadId} initialValues={lead} />
        </div>
    )
}
