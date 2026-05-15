"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { User, Lock, Camera, Eye, EyeOff, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/AuthContext"
import { USER_ROLE_META } from "@/constants/userRoles"
import type { AuthProfileUser } from "@/types/authProfile"
import { Image } from "@imagekit/next"

function PasswordField({
    id,
    label,
    value,
    onChange,
    autoComplete,
    show,
    onToggleShow
}: {
    id: string
    label: string
    value: string
    onChange: (v: string) => void
    autoComplete: string
    show: boolean
    onToggleShow: () => void
}) {
    return (
        <div>
            <label
                htmlFor={id}
                className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 mb-1"
            >
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={show ? "text" : "password"}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full pl-3 pr-11 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                />
                <button
                    type="button"
                    onClick={onToggleShow}
                    className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                    aria-label={show ? "Hide password" : "Show password"}
                >
                    {show ? (
                        <EyeOff className="w-4 h-4" />
                    ) : (
                        <Eye className="w-4 h-4" />
                    )}
                </button>
            </div>
        </div>
    )
}

export default function ProfileEditPage() {
    const router = useRouter()
    const { refreshUser } = useAuth()
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<AuthProfileUser | null>(null)
    const [avatarBroken, setAvatarBroken] = useState(false)

    const avatarInputRef = useRef<HTMLInputElement>(null)
    const [avatarUploading, setAvatarUploading] = useState(false)

    const [oldPassword, setOldPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [passwordSaving, setPasswordSaving] = useState(false)

    const [showOld, setShowOld] = useState(false)
    const [showNew, setShowNew] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const loadProfile = useCallback(async () => {
        const res = await fetch("/api/auth/profile", {
            credentials: "include",
            cache: "no-store"
        })

        const json = await res.json()

        if (res.status === 401) {
            router.replace("/admin/authentication/login")
            return false
        }

        if (!res.ok || !json?.success || !json?.data) {
            throw new Error(json?.message || "Failed to load profile")
        }

        setProfile(json.data as AuthProfileUser)
        return true
    }, [router])

    useEffect(() => {
        const load = async () => {
            try {
                await loadProfile()
            } catch (e: unknown) {
                const message =
                    e instanceof Error ? e.message : "Failed to load profile"
                toast.error(message)
                setProfile(null)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [loadProfile])

    const avatarUrl = profile?.avatar?.trim() || ""
    const showAvatar = Boolean(avatarUrl) && !avatarBroken

    useEffect(() => {
        setAvatarBroken(false)
    }, [avatarUrl])

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

        setAvatarUploading(true)
        try {
            const fd = new FormData()
            fd.append("avatarFile", file)

            const res = await fetch("/api/auth/profile/avatar", {
                method: "POST",
                credentials: "include",
                body: fd
            })

            const data = await res.json()

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Failed to update avatar")
            }

            await loadProfile()
            await refreshUser()
            toast.success(data.message || "Avatar updated")
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Failed to update avatar"
            toast.error(message)
        } finally {
            setAvatarUploading(false)
        }
    }

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!oldPassword || !newPassword) {
            toast.error("Please fill in all password fields")
            return
        }

        if (newPassword.length < 6) {
            toast.error("New password must be at least 6 characters")
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error("New password and confirmation do not match")
            return
        }

        setPasswordSaving(true)
        try {
            const res = await fetch("/api/auth/profile/password", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    oldPassword,
                    newPassword
                })
            })

            const data = await res.json()

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Failed to update password")
            }

            toast.success(data.message || "Password updated")
            setOldPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setShowOld(false)
            setShowNew(false)
            setShowConfirm(false)
            await loadProfile()
            router.push("/admin/operations/profile")
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Failed to update password"
            toast.error(message)
        } finally {
            setPasswordSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-neutral-600 dark:text-neutral-400">
                Loading…
            </div>
        )
    }

    if (!profile) {
        return (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-red-500">
                Could not load your profile.
            </div>
        )
    }

    const roleLabel =
        profile.role in USER_ROLE_META
            ? USER_ROLE_META[profile.role as keyof typeof USER_ROLE_META].label
            : `Role ${profile.role}`

    return (
        <div className="space-y-6 text-neutral-900 dark:text-neutral-100">
            <div className="flex flex-col gap-3">
                <Link
                    href="/admin/operations/profile"
                    className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 w-fit"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to profile
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold">Edit profile</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        Update your photo or password
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 md:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="w-20 h-20 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 overflow-hidden flex items-center justify-center">
                    {showAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <Image
                            src={avatarUrl}
                            alt=""
                            width={80}
                            height={80}
                            transformation={[
                                {
                                    width: 160,
                                    height: 160,
                                }
                            ]}
                            className="w-full h-full object-cover"
                            onError={() => setAvatarBroken(true)}
                        />
                    ) : (
                        <User size={36} strokeWidth={1.5} />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{profile.name}</p>
                    <p className="text-sm text-neutral-500 truncate">
                        {profile.email}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">{roleLabel}</p>
                </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 md:p-8 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                        <Camera className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Profile photo</h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            JPEG or PNG, up to 5 MB.
                        </p>
                    </div>
                </div>
                <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={handleAvatarChange}
                />
                <button
                    type="button"
                    disabled={avatarUploading}
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50"
                >
                    {avatarUploading ? "Uploading…" : "Change photo"}
                </button>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 md:p-8 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                        <Lock className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Change password</h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Enter your current password, then choose a new one.
                        </p>
                    </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
                    <PasswordField
                        id="edit-old-password"
                        label="Current password"
                        value={oldPassword}
                        onChange={setOldPassword}
                        autoComplete="current-password"
                        show={showOld}
                        onToggleShow={() => setShowOld((v) => !v)}
                    />
                    <PasswordField
                        id="edit-new-password"
                        label="New password"
                        value={newPassword}
                        onChange={setNewPassword}
                        autoComplete="new-password"
                        show={showNew}
                        onToggleShow={() => setShowNew((v) => !v)}
                    />
                    <PasswordField
                        id="edit-confirm-password"
                        label="Confirm new password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        autoComplete="new-password"
                        show={showConfirm}
                        onToggleShow={() => setShowConfirm((v) => !v)}
                    />
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="submit"
                            disabled={passwordSaving}
                            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {passwordSaving ? "Saving…" : "Update password"}
                        </button>
                        <Link
                            href="/admin/operations/profile"
                            className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 inline-flex items-center"
                        >
                            Cancel
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
