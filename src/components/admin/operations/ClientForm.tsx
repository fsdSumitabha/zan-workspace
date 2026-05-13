"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type ClientFormValues = {
    name: string
    company: string
    email: string
    phone: string
}

interface ClientFormProps {
    mode?: "create" | "edit"
    clientId?: string
    initialValues?: Partial<ClientFormValues>
}

export default function ClientForm({
    mode = "edit",
    clientId,
    initialValues
}: ClientFormProps) {
    const router = useRouter()

    const [form, setForm] = useState<ClientFormValues>({
        name: "",
        company: "",
        email: "",
        phone: ""
    })

    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (initialValues) {
            setForm({
                name: initialValues.name || "",
                company: initialValues.company || "",
                email: initialValues.email || "",
                phone: initialValues.phone || ""
            })
        }
    }, [initialValues])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!form.name || !form.company || !form.phone) {
            toast.error("Please fill required fields")
            return
        }

        try {
            setLoading(true)

            const isEdit = mode === "edit" && clientId
            const endpoint = isEdit
                ? `/api/admin/operations/clients/${clientId}`
                : "/api/admin/operations/clients"
            const method = isEdit ? "PATCH" : "POST"

            const res = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    company: form.company,
                    email: form.email || undefined,
                    phone: form.phone
                })
            })

            const data = await res.json()

            if (!res.ok || !data.success) {
                throw new Error(
                    data.message ||
                        (isEdit
                            ? "Failed to update client"
                            : "Failed to create client")
                )
            }

            toast.success(
                isEdit ? "Client updated successfully" : "Client created successfully"
            )

            const redirectId = isEdit ? clientId : data.data._id
            router.push(`/admin/operations/clients/${redirectId}`)
        } catch (error: unknown) {
            console.error(error)
            const message =
                error instanceof Error ? error.message : "Something went wrong"
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="p-5 rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 space-y-4"
        >
            <h2 className="text-lg font-semibold">
                {mode === "edit" ? "Edit Client" : "Create Client"}
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                        Name *
                    </label>
                    <input
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Client name"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                        Company *
                    </label>
                    <input
                        name="company"
                        value={form.company}
                        onChange={handleChange}
                        placeholder="Company name"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                        Phone *
                    </label>
                    <input
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="Phone number"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                        Email
                    </label>
                    <input
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="Email address"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
            >
                {loading
                    ? mode === "edit"
                        ? "Updating..."
                        : "Creating..."
                    : mode === "edit"
                      ? "Update Client"
                      : "Create Client"}
            </button>
        </form>
    )
}
