"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PROJECT_STATUS } from "@/constants/projectStatus"

export default function CreateProjectPage() {
    const router = useRouter()

    const [loading, setLoading] = useState(false)

    const [form, setForm] = useState({
        clientId: "",
        companyName: "",
        title: "",
        description: "",
        serviceType: "",
        budget: "",
        status: PROJECT_STATUS.DISCUSSION
    })

    function handleChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        try {
            const res = await fetch("/api/admin/projects", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ...form,
                    budget: form.budget ? Number(form.budget) : undefined
                })
            })

            const data = await res.json()

            if (!res.ok) {
                alert(data.message || "Something went wrong")
                return
            }

            router.push("/admin/operations/projects")
        } catch {
            alert("Failed to create project")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-6 max-w-3xl mx-auto text-neutral-800 dark:text-neutral-200">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-semibold">
                        Create Project
                    </h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Add a new project for an existing client
                    </p>
                </div>

                {/* Client Info */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold">Client Info</h2>

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
                        placeholder="Company Name (optional)"
                        value={form.companyName}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />
                </div>

                {/* Project Info */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold">Project Info</h2>

                    <input
                        name="title"
                        placeholder="Project Title"
                        value={form.title}
                        onChange={handleChange}
                        required
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />

                    <textarea
                        name="description"
                        placeholder="Project Description"
                        value={form.description}
                        onChange={handleChange}
                        rows={4}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />

                    <input
                        name="serviceType"
                        placeholder="Service Type (Web, SEO, etc.)"
                        value={form.serviceType}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />

                    <select
                        name="status"
                        value={form.status}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    >
                        {Object.entries(PROJECT_STATUS).map(([key, value]) => (
                            <option key={value} value={value}>
                                {key.replace("_", " ")}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Budget */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold">Budget</h2>

                    <input
                        name="budget"
                        type="number"
                        placeholder="Total Budget (₹)"
                        value={form.budget}
                        onChange={handleChange}
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />
                </div>

                {/* Actions */}
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
                        className="px-4 py-2 text-sm rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90"
                    >
                        {loading ? "Creating..." : "Create Project"}
                    </button>
                </div>
            </form>
        </div>
    )
}
