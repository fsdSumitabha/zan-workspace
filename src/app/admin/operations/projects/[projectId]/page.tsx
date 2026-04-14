"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"

import ProjectDetail from "@/components/admin/operations/ProjectDetail"
import ProjectDetailSkeleton from "@/components/admin/operations/skeletons/ProjectDetailSkeleton"

import { Project } from "@/types/projects"

import { toast } from "sonner"
import { useRouter } from "next/navigation"
import LeadInteractionActions from "@/components/admin/operations/LeadInteractionActions"
import InteractionModal from "@/components/admin/operations/InteractionModal/InteractionInlineForm"
import InteractionTimeline from "@/components/admin/operations/interactions/InteractionTimeline"
import { ProjectStatus } from "@/constants/projectStatus"

interface ApiResponse {
    success: boolean
    data: Project
}

export default function Page() {
    const params = useParams()
    const projectId = params.projectId as string
    console.log("Project ID:", projectId)
    const [project, setProject] = useState<Project | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeType, setActiveType] = useState<number | null>(null)
    const [isOpen, setIsOpen] = useState(false)

    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    const [interactions, setInteractions] = useState([])
    const [interactionLoading, setInteractionLoading] = useState(true)

    const handleOpen = (type: number) => {
        setActiveType(type)
        setIsOpen(true)
    }

    const handleClose = () => {
        setIsOpen(false)
        setActiveType(null)
    }

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

    const fetchInteractions = async () => {
        try {
            const res = await fetch(
                `/api/admin/operations/projects/${projectId}/interactions`
            )
            const data = await res.json()

            setInteractions(data.interactions || [])
        } catch (err) {
            console.error("Failed to fetch interactions", err)
        } finally {
            setInteractionLoading(false)
        }
    }

    useEffect(() => {
        if (projectId) fetchInteractions()
    }, [projectId])

    const deleteProject = async () => {
        if (deleting) return

        setDeleting(true)

        try {
            const res = await fetch(`/api/admin/operations/projects/${projectId}`, {
                method: "DELETE"
            })

            const data = await res.json()

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Failed to delete projects")
            }

            toast.success("Projects deleted successfully")

            router.push("/admin/operations/projects")

        } catch (error: any) {
            toast.error(error.message || "Something went wrong")
        } finally {
            setDeleting(false)
        }
    }

    const handleDelete = () => {
        toast("Are you sure you want to delete this project?", {
            action: {
                label: deleting ? "Deleting..." : "Delete",
                onClick: deleteProject
            },
            cancel: {
                label: "Cancel",
                onClick: () => { }
            }
        })
    }

    const handleStatusChange = async (status: ProjectStatus, remarks: string) => {
        if (!projectId) return

        const res = await fetch(`/api/admin/operations/projects/${projectId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, remarks }),
        })

        if (!res.ok) throw new Error("Failed to update status")

        toast.success("Status updated")

        const updated = await fetch(`/api/admin/operations/projects/${projectId}`)
        const data = await updated.json()

        if (data?.success && data?.data) {
            setProject(data.data)
        }

        fetchInteractions()
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">
            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                {/* LEFT */}
                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {/* Loading */}
                    {loading && (
                        <div className="space-y-4">
                            <ProjectDetailSkeleton />
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
                        <>
                            <ProjectDetail project={project} onStatusChange={handleStatusChange} />
                            <LeadInteractionActions leadId={projectId} onAction={handleOpen} activeType={activeType} />
                        </>
                    )}

                    {!loading && project && (
                        <div className="flex justify-end">
                            <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition" >
                                Delete Project
                            </button>
                        </div>
                    )}

                    <InteractionModal type={activeType} open={isOpen} onClose={handleClose} entityType={2} entityId={projectId} onSuccess={fetchInteractions} />

                    {!loading && project && (
                        <InteractionTimeline entityType={2} interactions={interactions} loading={interactionLoading} />
                    )}
                </div>

                {/* RIGHT */}
                <StatsPanel />
            </div>
        </div>
    )
}