"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import ClientForm from "@/components/admin/operations/ClientForm"

type ClientFormValues = {
    name: string
    company: string
    email: string
    phone: string
}

export default function Page() {
    const params = useParams()
    const clientId = params.clientId as string

    const [loading, setLoading] = useState(true)
    const [client, setClient] = useState<ClientFormValues | null>(null)

    useEffect(() => {
        const fetchClient = async () => {
            try {
                const res = await fetch(`/api/admin/operations/clients/${clientId}`)
                const data = await res.json()

                if (!res.ok || !data?.success || !data?.data?.client) {
                    throw new Error(data?.message || "Failed to load client")
                }

                const c = data.data.client
                setClient({
                    name: c.name || "",
                    company: c.company || "",
                    email: c.email || "",
                    phone: c.phone || ""
                })
            } catch (error: unknown) {
                const message =
                    error instanceof Error ? error.message : "Failed to load client"
                toast.error(message)
            } finally {
                setLoading(false)
            }
        }

        if (clientId) {
            fetchClient()
        }
    }, [clientId])

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="p-5 rounded-lg dark:rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                    Loading client details...
                </div>
            </div>
        )
    }

    if (!client) {
        return (
            <div className="space-y-4">
                <div className="p-5 rounded-lg dark:rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-red-500">
                    Client not found
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <ClientForm mode="edit" clientId={clientId} initialValues={client} />
        </div>
    )
}
