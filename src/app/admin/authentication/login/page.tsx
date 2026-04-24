"use client"

import { useState } from "react"

export default function Page() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()

        setLoading(true)
        setError(null)

        try {
            // TODO: replace with actual API call
            await new Promise((res) => setTimeout(res, 1200))

            // fake error
            if (email !== "admin@test.com") {
                throw new Error("Invalid credentials")
            }

            // redirect later
            console.log("Logged in")
        } catch (err: any) {
            setError(err.message || "Something went wrong")
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
                        <div>
                            <label className="text-xs text-neutral-500">
                                Password
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm outline-none focus:ring-2 focus:ring-neutral-400"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-800 disabled:opacity-60"
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