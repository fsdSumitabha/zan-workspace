"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { UserRole } from "@/constants/userRoles"
import type { RegionCode } from "@/lib/region"
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

    /** Public URL path under `/public`, e.g. `/uploads/avatars/...` */
    avatar?: string
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