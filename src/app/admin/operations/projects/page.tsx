import { Suspense } from "react"
import ProjectCardSkeleton from "@/components/admin/operations/skeletons/ProjectCardSkeleton"
import ProjectsClient from "./ProjectsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <ProjectCardSkeleton key={i} />
                    ))}
                </div>
            }
        >
            <ProjectsClient />
        </Suspense>
    )
}