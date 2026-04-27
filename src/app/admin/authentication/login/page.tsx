"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { Eye, EyeOff } from "lucide-react"

export default function Page() {
    const router = useRouter()
    const { refreshUser } = useAuth()

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !password) {
            toast.error("Email and password are required")
            return
        }

        setLoading(true)

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.message || "Login failed")
            }

            toast.success("Login successful")

            await refreshUser()

            // redirect after login
            router.push("/admin/operations")

        } catch (err: any) {
            toast.error(err.message || "Something went wrong")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-md">

                {/* ------------------- */}
                {/* Header */}
                {/* ------------------- */}
                <div className="mb-6 text-center">
                    <h1 className="text-xl font-semibold">
                        Admin Login
                    </h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Access your operations dashboard
                    </p>
                </div>

                {/* ------------------- */}
                {/* Card */}
                {/* ------------------- */}
                <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">

                    {/* ------------------- */}
                    {/* Error State */}
                    {/* ------------------- */}
                    {error && (
                        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-50 dark:bg-red-900/10 text-sm">
                            <p className="font-medium">Login failed</p>
                            <p className="text-xs text-neutral-500 mt-1">
                                {error}
                            </p>
                        </div>
                    )}

                    {/* ------------------- */}
                    {/* Form */}
                    {/* ------------------- */}
                    <form onSubmit={handleLogin} className="space-y-4">

                        {/* Email */}
                        <div>
                            <label className="text-xs text-neutral-500">
                                Email
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm outline-none focus:ring-2 focus:ring-neutral-400"
                                placeholder="you@company.com"
                            />
                        </div>

                        {/* Password */}
                        {/* Password */}
                        <div>
                            <label className="text-xs text-neutral-500">
                                Password
                            </label>

                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm outline-none focus:ring-2 focus:ring-neutral-400"
                                    placeholder="Enter password"
                                />

                                {/* Toggle Button */}
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => !prev)}
                                    className="absolute inset-y-0 right-2 flex items-center text-neutral-500 hover:text-neutral-700"
                                >
                                    {showPassword ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 rounded-md bg-neutral-800 text-white text-sm hover:bg-neutral-800 disabled:opacity-60"
                        >
                            {loading ? "Signing in..." : "Sign In"}
                        </button>
                    </form>

                    {/* ------------------- */}
                    {/* Footer */}
                    {/* ------------------- */}
                    <div className="mt-4 text-center">
                        <p className="text-xs text-neutral-500">
                            Only authorized users can access this panel
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}