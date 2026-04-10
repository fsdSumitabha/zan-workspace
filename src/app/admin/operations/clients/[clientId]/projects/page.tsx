"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import ProjectCardSkeleton from "@/components/admin/operations/skeletons/ProjectCardSkeleton"
import { Project } from "@/types/projects"
import ClientProjectPreviewCard from "@/components/admin/operations/ClientProjectPreviewCard"


export default function Page() {
    const params = useParams()
    const clientId = params.clientId as string

    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [allProjects, setAllProjects] = useState<Project[]>([])

    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const fetchProjects = async () => {
        try {
            setLoading(true)

            const res = await fetch(
                `/api/admin/operations/clients/${clientId}/projects`
            )

            const json = await res.json()

            if (json.success) {
                setAllProjects(json.data)

                // calculate total pages
                const total = json.data.length
                const pages = Math.ceil(total / 5)

                setTotalPages(pages)
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const start = (page - 1) * 5
        const end = start + 5

        setProjects(allProjects.slice(start, end))
    }, [page, allProjects])

    useEffect(() => {
        if (!clientId) return
        fetchProjects()
    }, [clientId])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                {/* LEFT */}
                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

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
                            <ClientProjectPreviewCard
                                key={project._id}
                                project={project}
                            />
                        ))}
                    {/* Pagination */}
                    {!loading && totalPages > 1 && (
                        <div className="flex justify-between items-center pt-4">

                            <button
                                disabled={page === 1}
                                onClick={() => setPage((p) => p - 1)}
                                className="px-3 py-1 rounded bg-neutral-800 disabled:opacity-50"
                            >
                                Previous
                            </button>

                            <span className="text-sm text-gray-400"> Page {page} of {totalPages} </span>

                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage((p) => p + 1)}
                                className="px-3 py-1 rounded bg-neutral-800 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>

                {/* RIGHT */}
                <StatsPanel />
            </div>
        </div>
    )
}