import { Suspense } from "react"
import ReportsClient from "./ReportsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
            }
        >
            <ReportsClient />
        </Suspense>
    )
}
