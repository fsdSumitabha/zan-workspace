import { Suspense } from "react"
import UserCardSkeleton from "@/components/admin/operations/UserCardSkeleton"
import UsersClient from "./UsersClient"

const PAGE_SIZE = 5

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                        <UserCardSkeleton key={i} />
                    ))}
                </div>
            }
        >
            <UsersClient />
        </Suspense>
    )
}