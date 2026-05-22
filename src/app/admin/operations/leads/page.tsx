import { Suspense } from "react"
import LeadCardSkeleton from "@/components/admin/operations/skeletons/LeadCardSkeleton"
import LeadsClient from "./LeadsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <LeadCardSkeleton key={i} />
                    ))}
                </div>
            }
        >
            <LeadsClient />
        </Suspense>
    )
}