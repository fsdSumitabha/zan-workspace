"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { UserRole } from "@/constants/userRoles"
import type { ActiveRegion, RegionCode } from "@/lib/region"
import { getBrowserTimeZone } from "@/lib/time/zone"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface AuthUser {
    id: string
    name?: string
    email?: string
    role: UserRole

    /**
     * Regions this user may see. Admin holds every code.
     * Comes from /api/auth/me, which reads the user row, not the token.
     */
    regions: RegionCode[]

    /**
     * What this session is narrowed to. `"ALL"` means every region above.
     * Worked out server-side, so it always matches what the APIs will do.
     */
    activeRegion: ActiveRegion

    /** Public URL path under `/public`, e.g. `/uploads/avatars/...` */
    avatar?: string

    /** The zone saved on the account, e.g. "Asia/Dubai". Null until a browser saves one. */
    timeZone?: string | null
}

interface AuthContextType {
    user: AuthUser | null
    loading: boolean
    isAuthenticated: boolean
    role: UserRole | null

    /** Empty until /api/auth/me returns. Never assume it has a value. */
    regions: RegionCode[]

    refreshUser: () => Promise<void>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter()

    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchUser = async () => {
        try {
            const res = await fetch("/api/auth/me", {
                method: "GET",
                credentials: "include",
                cache: "no-store" // IMPORTANT (Next 16)
            })

            if (!res.ok) {
                setUser(null)
                return
            }

            const data = await res.json().catch(() => null)

            if (data?.data) {
                setUser(data.data)
            } else {
                setUser(null)
            }

        } catch (error) {
            console.error("FETCH_USER_ERROR:", error)
            setUser(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUser()
    }, [])

    // Saves this browser's zone on the account when it differs, so
    // notifications write meeting times in the zone this person is in now.
    // Someone who flies from Kolkata to Dubai gets Dubai times from the next
    // page load. Fire and forget: a failure only means the old zone stays.
    const userId = user?.id
    const savedZone = user?.timeZone
    useEffect(() => {
        if (!userId) return
        const zone = getBrowserTimeZone()
        if (savedZone === zone) return
        fetch("/api/auth/timezone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timeZone: zone }),
        }).catch(() => {})
    }, [userId, savedZone])

    const refreshUser = async () => {
        setLoading(true)
        await fetchUser()
    }

    const logout = async () => {
        try {
            const res = await fetch("/api/auth/logout", {
                method: "POST"
            })

            if (!res.ok) {
                throw new Error("Logout failed")
            }

            // clear context
            setUser(null)

            toast.success("Logged out successfully")

            // small delay so user sees toast
            setTimeout(() => {
                router.push("/admin/authentication/login")
            }, 500)

        } catch (err: any) {
            toast.error(err.message || "Something went wrong")
        }
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                isAuthenticated: !!user,
                role: user?.role ?? null,
                regions: user?.regions ?? [],
                refreshUser,
                logout
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)

    if (!context) {
        throw new Error("useAuth must be used within AuthProvider")
    }

    return context
}