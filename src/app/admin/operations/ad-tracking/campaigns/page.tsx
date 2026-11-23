import { Suspense } from "react"
import AdRecordList from "@/components/admin/operations/ad-tracking/AdRecordList"

export default function Page() {
    return (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-white dark:bg-neutral-900" />}>
            <AdRecordList kind="campaign" />
        </Suspense>
    )
}
