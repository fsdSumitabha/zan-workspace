"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"

import ProjectDetail from "@/components/admin/operations/ProjectDetail"
import ProjectCardSkeleton from "@/components/admin/operations/skeletons/ProjectCardSkeleton"

import { Project } from "@/types/projects"

interface ApiResponse {
    success: boolean
    data: Project
}

export default function Page() {
    const params = useParams()
    const projectId = params.projectId as string

    const [project, setProject] = useState<Project | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchProject = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/projects/${projectId}`
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setProject(json.data)
            }
        } catch (error) {
            console.error("Failed to fetch project", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (projectId) fetchProject()
    }, [projectId])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                {/* LEFT */}
                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            <ProjectCardSkeleton />
                        </div>
                    )}

                    {/* Empty */}
                    {!loading && !project && (
                        <div className="text-center py-10 text-gray-500">
                            Project not found
                        </div>
                    )}

                    {/* Project */}
                    {!loading && project && (
                        <ProjectDetail
                            project={project}
                        />
                    )}
                </div>

                {/* RIGHT */}
                <StatsPanel />
            </div>
        </div>
    )
}