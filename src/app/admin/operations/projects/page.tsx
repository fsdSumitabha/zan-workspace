"use client"

import { useCallback, useEffect, useState } from "react"
import ProjectCard from "@/components/admin/operations/ProjectCard"
import ProjectCardSkeleton from "@/components/admin/operations/skeletons/ProjectCardSkeleton"
import { Project } from "@/types/projects"
import Pagination from "@/components/admin/operations/Pagination"

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

const PAGE_SIZE = 10

export default function Page() {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/projects?page=${page}&limit=${PAGE_SIZE}`
            )

            const json: ApiResponse = await res.json()

            if (json.success) {
                setProjects(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
        } finally {
            setLoading(false)
        }
    }, [page])

    useEffect(() => {
        fetchProjects()
    }, [fetchProjects])

    return (
                <div className="space-y-4">

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
                                createdBy={project.createdBy}
                            />
                        ))}

                    {/* Pagination */}
                    {!loading && (
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            disabled={loading}
                            onChange={setPage}
                        />
                    )}
                </div>
    )
}
