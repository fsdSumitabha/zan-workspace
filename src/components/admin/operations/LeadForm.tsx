"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import PhoneField from "@/components/phone/PhoneField"
import PhoneHint from "@/components/phone/PhoneHint"
import { useEditablePhone } from "@/components/phone/useEditablePhone"
import WriteRegionField, { useWriteRegion } from "@/components/admin/operations/region/WriteRegionField"

type LeadFormValues = {
    name: string
    email: string
    phone: string
    source: string
}

interface LeadFormProps {
    mode?: "create" | "edit"
    leadId?: string
    initialValues?: Partial<LeadFormValues>
}

export default function LeadForm({
    mode = "create",
    leadId,
    initialValues
}: LeadFormProps) {
    const router = useRouter()

    const [form, setForm] = useState<Omit<LeadFormValues, "phone">>({
        name: "",
        email: "",
        source: ""
    })

    const phone = useEditablePhone(mode === "edit" ? initialValues?.phone : "")

    // Create only. A lead's region does not change after it is saved.
    const region = useWriteRegion()

    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (mode === "edit" && initialValues) {
            setForm({
                name: initialValues.name || "",
                email: initialValues.email || "",
                source: initialValues.source || ""
            })
        }
    }, [mode, initialValues])

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const { name, value } = e.target
        setForm(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const phoneToSend = phone.check({ focus: true })

        if (!form.name || !form.source) {
            toast.error("Please fill required fields")
            return
        }
        if (!phoneToSend) return

        try {
            setLoading(true)

            const endpoint =
                mode === "edit" && leadId
                    ? `/api/admin/operations/leads/${leadId}`
                    : "/api/admin/operations/leads"

            const method = mode === "edit" ? "PATCH" : "POST"

            const res = await fetch(endpoint, {
                method,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ...form,
                    phone: phoneToSend,
                    ...(mode === "create" && region.value ? { region: region.value } : {})
                })
            })

            const data = await res.json()

            if (data?.field === "phone" && data.message) {
                phone.setError(data.message)
                return
            }

            if (!res.ok || !data.success) {
                throw new Error(
                    data.message ||
                    (mode === "edit" ? "Failed to update lead" : "Failed to create lead")
                )
            }

            toast.success(
                mode === "edit"
                    ? "Lead updated successfully"
                    : "Lead created successfully"
            )

            const redirectLeadId = mode === "edit" ? leadId : data.data._id
            router.push(`/admin/operations/leads/${redirectLeadId}`)

        } catch (error: any) {
            console.error(error)
            toast.error(error.message || "Something went wrong")
        } finally {
            setLoading(false)
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="p-5 rounded-lg dark:rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 space-y-4"
        >
            <h2 className="text-lg text-neutral-800 dark:text-neutral-200 font-semibold">
                {mode === "edit" ? "Edit Lead" : "Create Lead"}
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
                    placeholder="Enter full name"
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />
                </div>

                <div>
                    <label htmlFor="lead-phone" className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                    Phone *
                    </label>
                    <PhoneField
                    id="lead-phone"
                    name="phone"
                    {...phone.fieldProps}
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 ${phone.error ? "border-red-400 dark:border-red-500" : "dark:border-neutral-700"}`}
                    />
                    <PhoneHint error={phone.error} savedInvalid={phone.savedInvalid} />
                </div>

                <div>
                    <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                    Email
                    </label>
                    <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Enter email address"
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />
                </div>

                <div className="grid grid-cols-12 gap-4">
                    <div className={mode === "create" ? "col-span-8" : "col-span-12"}>
                        <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                        Source (Facebook, Google...) *
                        </label>
                        <input
                        name="source"
                        value={form.source}
                        onChange={handleChange}
                        placeholder="Enter source"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        />
                    </div>

                    {mode === "create" && (
                        <div className="col-span-4">
                            <WriteRegionField
                                id="lead-region"
                                value={region.value}
                                onChange={region.setValue}
                                options={region.options}
                                pinned={region.pinned}
                            />
                        </div>
                    )}
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
                        ? "Update Lead"
                        : "Create Lead"}
            </button>
        </form>
    )
}