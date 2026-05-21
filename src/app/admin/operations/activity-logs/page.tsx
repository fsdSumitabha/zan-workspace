import { Suspense } from "react"
import ActivityLogsClient from "./ActivityLogsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-neutral-600 dark:text-neutral-400">
                    Loading…
                </div>
            }
        >
            <ActivityLogsClient />
        </Suspense>
    )
}