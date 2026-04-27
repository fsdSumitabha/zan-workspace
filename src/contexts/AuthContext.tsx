"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { UserRole } from "@/constants/userRoles"

interface AuthUser {
    id: string
    name?: string
    email?: string
    role: UserRole
}

interface AuthContextType {
    user: AuthUser | null
    loading: boolean
    isAuthenticated: boolean
    role: UserRole | null
    refreshUser: () => Promise<void>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchUser = async () => {
        try {
            const res = await fetch("/api/auth/me", {
                method: "GET",
                credentials: "include"
            })

            const data = await res.json()

            if (res.ok && data.data) {
                setUser(data.data)
            } else {
                setUser(null)
            }
        } catch {
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
            await fetch("/api/auth/logout", {
                method: "POST"
            })
        } catch {}

        setUser(null)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                isAuthenticated: !!user,
                role: user?.role ?? null,
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