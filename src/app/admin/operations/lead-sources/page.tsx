import { Suspense } from "react"
import { LeadSourceRowSkeleton } from "@/components/admin/operations/lead-sources/LeadSourceRow"
import LeadSourcesClient from "./LeadSourcesClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <LeadSourceRowSkeleton key={i} />
                    ))}
                </div>
            }
        >
            <LeadSourcesClient />
        </Suspense>
    )
}
