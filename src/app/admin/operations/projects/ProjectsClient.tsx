"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import ProjectCard from "@/components/admin/operations/ProjectCard"
import ProjectCardSkeleton from "@/components/admin/operations/skeletons/ProjectCardSkeleton"
import { Project } from "@/types/projects"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"
import Pagination from "@/components/admin/operations/Pagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import ListFilters from "@/components/admin/operations/ListFilters"
import { usePagination } from "@/hooks/usePagination"
import { useSearch } from "@/hooks/useSearch"

interface ApiResponse {
    success: boolean
    data: Project[]
    message?: string
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

const PAGE_SIZE = 10

export default function ProjectsClient() {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [totalPages, setTotalPages] = useState(1)
    const [accessError, setAccessError] = useState<string | null>(null)
    const { page, setPage } = usePagination()
    const search = useSearch()

    const searchParams = useSearchParams()
    const status = searchParams.get("status") || ""
    const from = searchParams.get("from") || ""
    const to = searchParams.get("to") || ""

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true)
            setAccessError(null)

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            })
            if (search) params.set("search", search)
            if (status) params.set("status", status)
            if (from) params.set("from", from)
            if (to) params.set("to", to)

            const res = await fetch(
                `/api/admin/operations/projects?${params.toString()}`
            )

            const json: ApiResponse = await res.json()

            if (res.status === 401 || res.status === 403) {
                setAccessError(
                    json?.message ||
                        "You aren't authorized to perform this action."
                )
                setProjects([])
                return
            }

            if (json.success) {
                setProjects(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
        } finally {
            setLoading(false)
        }
    }, [page, search, status, from, to])

    useEffect(() => {
        fetchProjects()
    }, [fetchProjects])

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
        <div className="space-y-4">
            <ListFilters statusMeta={PROJECT_STATUS_META} />

            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <ProjectCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {!loading && projects.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No projects found
                </div>
            )}

            {!loading &&
                projects.map((project) => (
                    <ProjectCard
                        key={project._id}
                        id={project._id}
                        client={{
                            id: project.clientId?._id,
                            name: project.clientId?.name,
                            company: project.clientId?.company,
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