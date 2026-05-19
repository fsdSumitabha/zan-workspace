"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, User, Mail, Shield, Calendar, Clock, UserCircle, RefreshCw, Pencil } from "lucide-react"
import { toast } from "sonner"

import { USER_ROLE_META } from "@/constants/userRoles"
import type { AuthProfileUser } from "@/types/authProfile"
import { Image } from "@imagekit/next"
import ActivityLogFilters from "@/components/admin/operations/activityLog/ActivityLogFilters"
import ActivityLogList from "@/components/admin/operations/activityLog/ActivityLogList"
import {
    EMPTY_FILTERS,
    type ActivityLogFilterState,
} from "@/components/admin/operations/activityLog/types"

export default function ProfilePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<AuthProfileUser | null>(null)
    const [avatarBroken, setAvatarBroken] = useState(false)
    const [activityFilters, setActivityFilters] =
        useState<ActivityLogFilterState>({ ...EMPTY_FILTERS })

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

    if (loading) {
        return (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-neutral-600 dark:text-neutral-400">
                Loading profile…
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

    const formatDt = (iso: string | null) => {
        if (!iso) return "—"
        try {
            return new Date(iso).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short"
            })
        } catch {
            return "—"
        }
    }

    return (
        <div className="space-y-6 text-neutral-900 dark:text-neutral-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Profile</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        Your account details
                    </p>
                </div>
                <Link
                    href="/admin/operations/profile/edit"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition shrink-0"
                >
                    <Pencil className="w-4 h-4" />
                    Edit profile
                </Link>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="p-6 md:p-8 flex flex-col sm:flex-row sm:items-start gap-6 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="w-24 h-24 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 overflow-hidden flex items-center justify-center">
                        {showAvatar ? (
                            <Image
                                src={avatarUrl}
                                alt=""
                                width={80}
                                height={80}
                                className="w-full h-full object-cover"
                                onError={() => setAvatarBroken(true)}
                            />
                        ) : (
                            <User size={40} strokeWidth={1.5} />
                        )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                        <h2 className="text-xl font-semibold truncate">
                            {profile.name}
                        </h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-2 truncate">
                            <Mail className="w-4 h-4 shrink-0" />
                            {profile.email}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                <Shield className="w-3.5 h-3.5" />
                                {roleLabel}
                            </span>
                            <span
                                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                                    profile.isActive
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                        : "bg-red-500/15 text-red-700 dark:text-red-400"
                                }`}
                            >
                                {profile.isActive ? "Active" : "Inactive"}
                            </span>
                        </div>
                    </div>
                </div>

                <dl className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 dark:divide-neutral-800">
                    <div className="p-5 md:p-6">
                        <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Member since
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                            {formatDt(profile.createdAt)}
                        </dd>
                    </div>
                    <div className="p-5 md:p-6">
                        <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Last login
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                            {formatDt(profile.lastLoginAt)}
                        </dd>
                    </div>
                    <div className="p-5 md:p-6 sm:col-span-2 border-t border-neutral-100 dark:border-neutral-800">
                        <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Profile last updated
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                            {formatDt(profile.updatedAt)}
                        </dd>
                    </div>
                </dl>

                {profile.createdBy && (
                    <div className="p-5 md:p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/50">
                        <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                            <UserCircle className="w-3.5 h-3.5" />
                            Created by
                        </h3>
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            {profile.createdBy.name || "—"}
                        </p>
                        {profile.createdBy.email && (
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                                {profile.createdBy.email}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-500" />
                        My activity
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Everything you&rsquo;ve done across the system.
                    </p>
                </div>

                <ActivityLogFilters
                    value={activityFilters}
                    onChange={setActivityFilters}
                    isAdmin={false}
                />

                <ActivityLogList
                    filters={activityFilters}
                    forceUserId={profile.id}
                />
            </section>
        </div>
    )
}
