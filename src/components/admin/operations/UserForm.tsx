"use client"

import { useState } from "react"
import { USER_ROLE_META, UserRole } from "@/constants/userRoles"
import FileUpload from "@/components/admin/operations/dropzone/FileUpload"
import AvatarPreview from "@/components/admin/operations/AvatarPreview"

interface UserFormValues {
    name: string
    email: string
    password: string
    role: UserRole
    isActive: boolean
    avatar?: string
    avatarFile?: File | null
}

interface Props {
    onSubmit: (data: UserFormValues) => Promise<void>
    loading?: boolean
    defaultValues?: Partial<UserFormValues>
}

export default function UserForm({
    onSubmit,
    loading = false,
    defaultValues
}: Props) {
    const [form, setForm] = useState<UserFormValues>({
        name: defaultValues?.name || "",
        email: defaultValues?.email || "",
        password: "",
        role: defaultValues?.role || 10,
        isActive: defaultValues?.isActive ?? true,
        avatar: defaultValues?.avatar || "",
        avatarFile: null as File | null
    })

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const { name, value, type } = e.target

        if (type === "checkbox") {
            const checked = (e.target as HTMLInputElement).checked
            setForm((prev) => ({ ...prev, [name]: checked }))
        } else {
            setForm((prev) => ({
                ...prev,
                [name]: name === "role" ? Number(value) : value
            }))
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await onSubmit(form)
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="
            p-5 rounded-xl border
            border-gray-300 dark:border-neutral-700
            bg-white dark:bg-neutral-900
            space-y-6
        "
        >
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Create User
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT SIDE: Form Fields */}
                <div className="lg:col-span-7 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                            Name *
                        </label>
                        <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            placeholder="Enter full name"
                            required
                            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                            Email *
                        </label>
                        <input
                            name="email"
                            type="email"
                            value={form.email}
                            onChange={handleChange}
                            placeholder="Enter email"
                            required
                            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                            Password *
                        </label>
                        <input
                            name="password"
                            type="password"
                            value={form.password}
                            onChange={handleChange}
                            placeholder="Enter password"
                            required
                            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        />
                    </div>

                    {/* Role */}
                    <div>
                        <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                            Role *
                        </label>
                        <select
                            name="role"
                            value={form.role}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        >
                            {Object.entries(USER_ROLE_META).map(([key, meta]) => (
                                <option key={key} value={key}>
                                    {meta.label}
                                </option>
                            ))}
                        </select>

                        {/* Role description */}
                        <p className="text-xs mt-1 text-gray-500 dark:text-neutral-400">
                            {USER_ROLE_META[form.role]?.description}
                        </p>
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center gap-2 sm:col-span-2 mt-2">
                        <input
                            type="checkbox"
                            name="isActive"
                            checked={form.isActive}
                            onChange={handleChange}
                            className="w-4 h-4"
                        />
                        <label className="text-sm text-gray-600 dark:text-gray-300">
                            Active User
                        </label>
                    </div>
                </div>

                {/* RIGHT SIDE: Avatar Upload Container */}
                <div className="lg:col-span-5">
                    <div className="rounded-xl p-5 bg-gray-50 dark:bg-neutral-800/50 h-full">
                        <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                            Avatar
                        </label>

                        {!form.avatarFile && !form.avatar ? (
                            // Empty state — dropzone
                            <FileUpload
                                file={form.avatarFile ?? null}
                                setFile={(file) =>
                                    setForm((prev) => ({ ...prev, avatarFile: file }))
                                }
                                acceptedTypes={["image/jpeg", "image/png"]}
                            />
                        ) : (
                            // Filled state — circular preview + file info row
                            <AvatarPreview
                                file={form.avatarFile ?? null}
                                fallbackUrl={form.avatar}
                                onReplace={(file) =>
                                    setForm((prev) => ({ ...prev, avatarFile: file, avatar: "" }))
                                }
                                onRemove={() =>
                                    setForm((prev) => ({ ...prev, avatarFile: null, avatar: "" }))
                                }
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-gray-200 dark:border-neutral-700">
                <button
                    type="submit"
                    disabled={loading}
                    className="
                    px-6 py-2.5 rounded-lg text-sm font-medium
                    bg-black text-white hover:opacity-90
                    disabled:opacity-50 transition-all
                    dark:bg-white dark:text-black
                "
                >
                    {loading ? "Creating..." : "Create User"}
                </button>
            </div>
        </form>
    )
}