import { Suspense } from "react"
import ImportsList from "@/components/admin/operations/ad-tracking/ImportsList"

export default function Page() {
    return (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-white dark:bg-neutral-900" />}>
            <ImportsList />
        </Suspense>
    )
}
