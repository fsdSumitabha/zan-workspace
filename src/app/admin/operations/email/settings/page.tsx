import { Suspense } from "react"
import EmailSettingsClient from "./EmailSettingsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                        />
                    ))}
                </div>
            }
        >
            <EmailSettingsClient />
        </Suspense>
    )
}
