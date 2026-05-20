"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { User } from "@/types/user"
import { useCallback, useEffect, useState } from "react"
import UserCard from "@/components/admin/operations/UserCard"
import UserCardSkeleton from "@/components/admin/operations/UserCardSkeleton"
import CreateActionButton from "@/components/admin/operations/CreateActionButton"
import Pagination from "@/components/admin/operations/Pagination"
import { usePagination } from "@/hooks/usePagination"

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

const PAGE_SIZE = 5

export default function Page() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const { page, setPage } = usePagination()

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/users?page=${page}&limit=${PAGE_SIZE}`
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setUsers(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
            }
        } catch (error) {
            console.error("Failed to fetch users", error)
        } finally {
            setLoading(false)
        }
    }, [page])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    return (
        <div className="space-y-4">
            <CreateActionButton href="users/create" label="Create New User" />

            {/* Loading */}
            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: PAGE_SIZE }).map((_, i) => (
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
            {!loading && (
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onChange={setPage}
                />
            )}

            <Link
                href={"users/create"}
                className="
                                fixed bottom-6 right-6
                                h-14 w-14 rounded-full
                                bg-blue-600 hover:bg-blue-500
                                text-white
                                flex items-center justify-center
                                shadow-lg hover:shadow-xl
                                transition
                            "
            >
                <Plus size={22} />
            </Link>
        </div>
    )
}
