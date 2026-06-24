"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { Lead } from "@/types/lead"
import LeadInfoCard from "@/components/admin/operations/LeadInfoCard"

export default function ConvertLeadPage() {
    const params = useParams()
    const router = useRouter()

    const leadId = params.leadId as string

    const [lead, setLead] = useState<Lead | null>(null)
    const [company, setCompany] = useState("")
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        const fetchLead = async () => {
            try {
                const res = await fetch(
                    `/api/admin/operations/leads/${leadId}`
                )
                const data = await res.json()

                if (!data.success) {
                    toast.error("Failed to load lead")
                    return
                }

                setLead(data.data.lead)
            } catch {
                toast.error("Something went wrong")
            } finally {
                setLoading(false)
            }
        }

        fetchLead()
    }, [leadId])

    const handleConvert = async () => {
        if (!company) {
            toast.error("Company is required")
            return
        }

        setSubmitting(true)

        try {
            const res = await fetch(
                `/api/admin/operations/leads/${leadId}/convert`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ company })
                }
            )

            const data = await res.json()

            if (!data.success) {
                toast.error(data.message || "Conversion failed")
                return
            }

            toast.success("Lead converted successfully")

            setTimeout(() => {
                router.push(`/admin/operations/clients/${data.data.clientId}`)
            }, 2000)

        } catch {
            toast.error("Something went wrong")
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="p-6 text-gray-600 dark:text-gray-300">
                Loading...
            </div>
        )
    }

    if (!lead) {
        return (
            <div className="p-6 text-red-500">
                Lead not found
            </div>
        )
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Lead Info */}
            <LeadInfoCard lead={lead} />

            {/* Convert Form */}
            <div className="mt-6 p-5 rounded-2xl shadow-sm border bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
                    Convert to Client
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                            Company *
                        </label>
                        <input
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                            placeholder="Enter company name"
                        />
                    </div>

                    <button
                        onClick={handleConvert}
                        disabled={submitting}
                        className="w-full py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition"
                    >
                        {submitting ? "Converting..." : "Convert to Client"}
                    </button>
                </div>
            </div>
        </div>
    )
}