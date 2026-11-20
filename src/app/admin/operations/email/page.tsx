import { Suspense } from "react"
import EmailOverviewClient from "./EmailOverviewClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
                    <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
                </div>
            }
        >
            <EmailOverviewClient />
        </Suspense>
    )
}
