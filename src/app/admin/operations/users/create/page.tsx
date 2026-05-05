"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import UserForm from "@/components/admin/operations/UserForm"

interface UserFormValues {
    name: string
    email: string
    password: string
    role: number
    isActive: boolean
    avatar?: string
    avatarFile?: File | null
}

export default function Page() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const handleCreateUser = async (data: UserFormValues) => {
        setLoading(true)
        const toastId = toast.loading("Creating user...")

        try {
            const fd = new FormData()
            fd.append("name", data.name)
            fd.append("email", data.email)
            fd.append("password", data.password)
            fd.append("role", String(data.role))
            fd.append("isActive", String(data.isActive))

            if (data.avatarFile) {
                fd.append("avatarFile", data.avatarFile)
            }

            const res = await fetch("/api/admin/operations/users", {
                method: "POST",
                body: fd
            })

            const json = await res.json()

            if (!res.ok || !json.success) {
                throw new Error(json.message || "Failed to create user")
            }

            toast.success(`${json.data.name} has been created`, {
                id: toastId,
                description: json.data.email
            })

            // Redirect to user list (adjust path to your route)
            router.push("/admin/operations/users")
            router.refresh()
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Something went wrong"

            toast.error("Failed to create user", {
                id: toastId,
                description: message
            })
        } finally {
            setLoading(false)
        }
    }

    return <UserForm onSubmit={handleCreateUser} loading={loading} />
}