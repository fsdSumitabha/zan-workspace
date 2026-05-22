import { Suspense } from "react"
import ClientCardSkeleton from "@/components/admin/operations/skeletons/ClientCardSkeleton"
import ClientsClient from "./ClientsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <ClientCardSkeleton key={i} />
                    ))}
                </div>
            }
        >
            <ClientsClient />
        </Suspense>
    )
}