import { Suspense } from "react"
import TemplatesClient from "./TemplatesClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                        />
                    ))}
                </div>
            }
        >
            <TemplatesClient />
        </Suspense>
    )
}
