import { Suspense } from "react"
import UploadsClient from "./UploadsClient"

export default function Page() {
    return (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-white dark:bg-neutral-900" />}>
            <UploadsClient />
        </Suspense>
    )
}
