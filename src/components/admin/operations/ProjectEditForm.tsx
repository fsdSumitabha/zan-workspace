"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PROJECT_STATUS, type ProjectStatus } from "@/constants/projectStatus"
import { Service } from "@/constants/services"

export type ProjectEditFormInitialValues = {
    clientId: string
    companyName: string
    title: string
    description: string
    serviceType: string
    budget: string
    status: ProjectStatus
}

type Props = {
    projectId: string
    initialValues: ProjectEditFormInitialValues
}

export default function ProjectEditForm({ projectId, initialValues }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState<ProjectEditFormInitialValues>(initialValues)

    useEffect(() => {
        setForm(initialValues)
    }, [initialValues])

    function handleChange(
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
    ) {
        const { name, value } = e.target
        if (name === "status") {
            setForm((prev) => ({
                ...prev,
                status: Number(value) as ProjectStatus
            }))
            return
        }
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!form.clientId?.trim() || !form.title?.trim()) {
            toast.error("Client ID and project title are required")
            return
        }

        setLoading(true)
        const toastId = toast.loading("Updating project...")

        try {
            const payload: Record<string, unknown> = {
                clientId: form.clientId.trim(),
                title: form.title.trim(),
                description: form.description || undefined,
                serviceType: form.serviceType || undefined,
                status: Number(form.status),
                companyName: form.companyName?.trim() || undefined,
                budget: form.budget ? Number(form.budget) : undefined
            }

            const res = await fetch(
                `/api/admin/operations/projects/${projectId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            )

            const data = await res.json()

            if (!res.ok || !data?.success) {
                toast.error(data?.message || "Something went wrong", {
                    id: toastId
                })
                return
            }

            toast.success("Project updated successfully", { id: toastId })
            router.push(`/admin/operations/projects/${projectId}`)
        } catch {
            toast.error("Failed to update project", { id: toastId })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-4 text-neutral-800 dark:text-neutral-200">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold">Edit Project</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Update project details for this client
                    </p>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl space-y-4">
                    <h2 className="text-lg font-semibold">Client</h2>
                    <input
                        name="clientId"
                        placeholder="Client ID"
                        value={form.clientId}
                        onChange={handleChange}
                        required
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />

                    <input
                        name="companyName"
                        placeholder="Company name (optional)"
                        value={form.companyName}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl space-y-4">
                    <h2 className="text-lg font-semibold">Project info</h2>

                    <input
                        name="title"
                        placeholder="Project title"
                        value={form.title}
                        onChange={handleChange}
                        required
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />

                    <textarea
                        name="description"
                        placeholder="Project description"
                        value={form.description}
                        onChange={handleChange}
                        rows={4}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />

                    <select
                        name="serviceType"
                        value={form.serviceType}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    >
                        <option value="">Select service type</option>
                        {Object.entries(Service)
                            .filter(([key]) => Number.isNaN(Number(key)))
                            .map(([key, value]) => (
                                <option key={value} value={String(value)}>
                                    {key.replaceAll("_", " ")}
                                </option>
                            ))}
                    </select>

                    <select
                        name="status"
                        value={String(form.status)}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    >
                        {Object.entries(PROJECT_STATUS).map(([key, value]) => (
                            <option key={value} value={String(value)}>
                                {key.replace("_", " ")}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl space-y-4">
                    <h2 className="text-lg font-semibold">Budget</h2>
                    <input
                        name="budget"
                        type="number"
                        placeholder="Total budget (₹)"
                        value={form.budget}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-sm rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Saving..." : "Save changes"}
                    </button>
                </div>
            </form>
        </div>
    )
}
