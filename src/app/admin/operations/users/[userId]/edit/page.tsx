"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import UserForm from "@/components/admin/operations/UserForm"
import { UserRole } from "@/constants/userRoles"

interface UserFormValues {
    name: string
    email: string
    password: string
    role: UserRole
    isActive: boolean
    avatar?: string
    avatarFile?: File | null
}

interface LoadedUser {
    _id: string
    name: string
    email: string
    role: UserRole
    isActive: boolean
    avatar?: string
}

export default function Page() {
    const router = useRouter()
    const { userId } = useParams<{ userId: string }>()

    const [user, setUser] = useState<LoadedUser | null>(null)
    const [fetching, setFetching] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    /* ------------------------------ load the user ----------------------------- */

    useEffect(() => {
        let ignore = false

        const loadUser = async () => {
            setFetching(true)
            setLoadError(null)

            try {
                const res = await fetch(`/api/admin/operations/users/${userId}`)
                const json = await res.json()

                if (!res.ok || !json.success) {
                    throw new Error(json.message || "Failed to load user")
                }

                if (!ignore) setUser(json.data)
            } catch (err) {
                if (!ignore) {
                    setLoadError(
                        err instanceof Error ? err.message : "Something went wrong"
                    )
                }
            } finally {
                if (!ignore) setFetching(false)
            }
        }

        if (userId) loadUser()

        return () => {
            ignore = true
        }
    }, [userId])

    /* -------------------------------- save edits ------------------------------- */

    const handleUpdateUser = async (data: UserFormValues) => {
        if (!user) return

        const fd = new FormData()

        // The API does partial updates — only send what actually changed
        if (data.name.trim() !== user.name) {
            fd.append("name", data.name)
        }

        if (data.email.trim().toLowerCase() !== user.email.toLowerCase()) {
            fd.append("email", data.email)
        }

        if (data.role !== user.role) {
            fd.append("role", String(data.role))
        }

        if (data.isActive !== user.isActive) {
            fd.append("isActive", String(data.isActive))
        }

        // Blank password field = keep the current one
        if (data.password) {
            fd.append("password", data.password)
        }

        if (data.avatarFile) {
            fd.append("avatarFile", data.avatarFile)
        } else if (user.avatar && !data.avatar) {
            fd.append("removeAvatar", "true")
        }

        if (Array.from(fd.keys()).length === 0) {
            toast.info("Nothing changed yet")
            return
        }

        setLoading(true)
        const toastId = toast.loading("Saving changes...")

        try {
            const res = await fetch(`/api/admin/operations/users/${userId}`, {
                method: "PATCH",
                body: fd
            })

            const json = await res.json()

            if (!res.ok || !json.success) {
                throw new Error(json.message || "Failed to update user")
            }

            toast.success(`${json.data.name} has been updated`, {
                id: toastId,
                description: json.data.email
            })

            setUser(json.data)

            router.push("/admin/operations/users")
            router.refresh()
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Something went wrong"

            toast.error("Failed to update user", {
                id: toastId,
                description: message
            })
        } finally {
            setLoading(false)
        }
    }

    /* --------------------------------- states --------------------------------- */

    if (fetching) {
        return (
            <div
                className="
                    p-5 rounded-lg dark:rounded-xl border
                    border-gray-300 dark:border-neutral-700
                    bg-white dark:bg-neutral-900
                "
            >
                <p className="text-sm text-gray-500 dark:text-neutral-400">
                    Loading user...
                </p>
            </div>
        )
    }

    if (loadError || !user) {
        return (
            <div
                className="
                    p-5 rounded-lg dark:rounded-xl border
                    border-gray-300 dark:border-neutral-700
                    bg-white dark:bg-neutral-900
                    space-y-4
                "
            >
                <div>
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        This user could not be loaded
                    </h2>
                    <p className="text-sm mt-1 text-gray-500 dark:text-neutral-400">
                        {loadError || "The user no longer exists."}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => router.push("/admin/operations/users")}
                    className="
                        px-6 py-2.5 rounded-lg text-sm font-medium
                        bg-black text-white hover:opacity-90
                        transition-all
                        dark:bg-white dark:text-black
                    "
                >
                    Back to users
                </button>
            </div>
        )
    }

    return (
        <UserForm
            key={user._id}
            mode="edit"
            onSubmit={handleUpdateUser}
            loading={loading}
            defaultValues={{
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                avatar: user.avatar || ""
            }}
        />
    )
}