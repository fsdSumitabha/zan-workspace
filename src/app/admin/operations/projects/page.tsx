"use client"

import { useEffect, useState } from "react"
import ProjectCard from "@/components/admin/operations/ProjectCard"
import ProjectCardSkeleton from "@/components/admin/operations/skeletons/ProjectCardSkeleton"
import { Project } from "@/types/projects"

interface ApiResponse {
    success: boolean
    data: Project[]
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

export default function Page() {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)

    const fetchProjects = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                "/api/admin/operations/projects?page=1&limit=10"
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setProjects(json.data)
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchProjects()
    }, [])

    return (
                <div className="">

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <ProjectCardSkeleton key={i} />
                            ))}
                        </div>
                    )}

                    {/* Empty */}
                    {!loading && projects.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            No projects found
                        </div>
                    )}

                    {/* List */}
                    {!loading &&
                        projects.map((project) => (
                            <ProjectCard
                                key={project._id}
                                id={project._id}
                                client={{
                                    id: project.clientId._id,
                                    name: project.clientId.name,
                                    company: project.clientId.company
                                }}
                                title={project.title}
                                description={project.description}
                                serviceType={project.serviceType}
                                status={project.status}
                                budget={project.budget}
                                createdAt={project.createdAt}
                            />
                        ))}
                </div>
    )
}