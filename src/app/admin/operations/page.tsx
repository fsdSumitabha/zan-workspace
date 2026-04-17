"use client"

import { useEffect, useState } from "react"
import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import EntityCard from "@/components/admin/operations/EntityCard"

import { toast } from "sonner"

interface Entity {
    _id: string
    entityType: number
    [key: string]: any
}

export default function Page() {
    const [data, setData] = useState<Entity[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isMounted = true

        async function fetchData() {
            try {
                setLoading(true)
                setError(null)

                const res = await fetch("/api/admin/operations", {
                    method: "GET",
                    cache: "no-store"
                })

                if (!res.ok) {
                    throw new Error(`Request failed: ${res.status}`)
                }

                const json = await res.json()

                // Defensive parsing
                if (!json || !Array.isArray(json.data)) {
                    throw new Error("Invalid API response")
                }

                if (isMounted) {
                    setData(json.data)
                }
            } catch (err: any) {
                console.error("Operations fetch error:", err)

                if (isMounted) {
                    setError(err.message || "Something went wrong")
                    toast.error("Failed to load operations data")
                }
            } finally {
                if (isMounted) {
                    setLoading(false)
                }
            }
        }

        fetchData()

        return () => {
            isMounted = false
        }
    }, [])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">

            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                {/* LEFT SIDE */}
                <div className="lg:col-span-2 space-y-4">

                    {/* ------------------- */}
                    {/* Loading State */}
                    {/* ------------------- */}
                    {loading && (
                        <div className="space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="h-24 rounded-xl bg-neutral-200 dark:bg-neutral-800 animate-pulse"
                                />
                            ))}
                        </div>
                    )}

                    {/* ------------------- */}
                    {/* Error State */}
                    {/* ------------------- */}
                    {!loading && error && (
                        <div className="p-4 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-900/10 text-sm">
                            <p className="font-medium">Failed to load data</p>
                            <p className="text-xs text-neutral-500 mt-1">{error}</p>

                            <button
                                onClick={() => location.reload()}
                                className="mt-3 text-xs px-3 py-1 rounded-md bg-red-500 text-white hover:bg-red-600"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* ------------------- */}
                    {/* Empty State */}
                    {/* ------------------- */}
                    {!loading && !error && data.length === 0 && (
                        <div className="p-6 text-center border border-neutral-800 rounded-xl">
                            <p className="text-sm text-neutral-400">
                                No data found
                            </p>
                        </div>
                    )}

                    {/* ------------------- */}
                    {/* Data List */}
                    {/* ------------------- */}
                    {!loading && !error && data.length > 0 && (
                        <div className="space-y-3">
                            {data.map((item) => (
                                <EntityCard key={item._id} item={item} />
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT SIDE */}
                <StatsPanel />
            </div>
        </div>
    )
}