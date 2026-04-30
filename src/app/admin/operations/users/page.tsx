"use client"

import { useEffect, useState } from "react"
import { User } from "@/types/user"
import UserCard from "@/components/admin/operations/UserCard"
import UserCardSkeleton from "@/components/admin/operations/UserCardSkeleton"

interface ApiResponse {
    success: boolean
    data: User[]
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

export default function Page() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)

    const [page, setPage] = useState(1)
    const [limit] = useState(5)
    const [pagination, setPagination] = useState<ApiResponse["pagination"] | null>(null)

    const fetchUsers = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/users?page=${page}&limit=${limit}`
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setUsers(json.data)
                setPagination(json.pagination)
            }
        } catch (error) {
            console.error("Failed to fetch users", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
    }, [page])

    return (
        <div className="space-y-4">

            {/* Loading */}
            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: limit }).map((_, i) => (
                        <UserCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {/* Empty */}
            {!loading && users.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No users found
                </div>
            )}

            {/* List */}
            {!loading &&
                users.map((user) => (
                    <UserCard key={user._id} user={user} />
                ))}

            {/* Pagination */}
            {!loading && pagination && pagination.pages > 1 && (
                <div className="flex items-center justify-between pt-4">

                    {/* Info */}
                    <p className="text-sm text-gray-500 dark:text-neutral-400">
                        Page {pagination.page} of {pagination.pages}
                    </p>

                    {/* Controls */}
                    <div className="flex gap-2">

                        <button
                            onClick={() => setPage((p) => p - 1)}
                            disabled={page === 1}
                            className="
                                px-3 py-1 rounded-md border text-sm
                                bg-white border-gray-200
                                hover:bg-gray-100
                                disabled:opacity-50 disabled:cursor-not-allowed

                                dark:bg-neutral-900 dark:border-neutral-700
                                dark:hover:bg-neutral-800
                            "
                        >
                            Prev
                        </button>

                        <button
                            onClick={() => setPage((p) => p + 1)}
                            disabled={page === pagination.pages}
                            className="
                                px-3 py-1 rounded-md border text-sm
                                bg-white border-gray-200
                                hover:bg-gray-100
                                disabled:opacity-50 disabled:cursor-not-allowed

                                dark:bg-neutral-900 dark:border-neutral-700
                                dark:hover:bg-neutral-800
                            "
                        >
                            Next
                        </button>

                    </div>
                </div>
            )}
        </div>
    )
}