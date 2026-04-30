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

    const fetchUsers = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                "/api/admin/operations/users"
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setUsers(json.data)
            }
        } catch (error) {
            console.error("Failed to fetch users", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    return (

        <div className="space-y-4">

            {/* Loading Skeleton */}
            {loading && (
                <div className="space-y-4">
                    {loading &&
                        Array.from({ length: 5 }).map((_, i) => (
                            <UserCardSkeleton key={i} />
                        ))}
                </div>
            )}

            {/* Users List */}
            {!loading && users.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No users found
                </div>
            )}

            {!loading &&
                users.map((user) => (
                    <UserCard
                        key={user._id}
                        user={user}
                    />
                ))}
        </div>
    )
}