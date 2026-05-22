"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import ProjectEditForm, {
    type ProjectEditFormInitialValues
} from "@/components/admin/operations/ProjectEditForm"
import type { Project } from "@/types/projects"
import { PROJECT_STATUS } from "@/constants/projectStatus"

function mapProjectToFormValues(project: Project): ProjectEditFormInitialValues {
    const clientId =
        typeof project.clientId === "object" &&
        project.clientId !== null &&
        "_id" in project.clientId
            ? project.clientId._id
            : String(project.clientId ?? "")

    return {
        clientId,
        companyName: project.companyName ?? "",
        title: project.title ?? "",
        description: project.description ?? "",
        serviceType:
            project.serviceType !== undefined && project.serviceType !== null
                ? String(project.serviceType)
                : "",
        budget:
            project.budget !== undefined && project.budget !== null
                ? String(project.budget)
                : "",
        status: project.status ?? PROJECT_STATUS.DISCUSSION
    }
}

export default function EditProjectPage() {
    const params = useParams()
    const projectId = params.projectId as string

    const [loading, setLoading] = useState(true)
    const [initialValues, setInitialValues] =
        useState<ProjectEditFormInitialValues | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(
                    `/api/admin/operations/projects/${projectId}`
                )
                const json = await res.json()

                if (!res.ok || !json?.success || !json?.data) {
                    throw new Error(json?.message || "Failed to load project")
                }

                setInitialValues(mapProjectToFormValues(json.data as Project))
            } catch (e: unknown) {
                const message =
                    e instanceof Error ? e.message : "Failed to load project"
                toast.error(message)
                setInitialValues(null)
            } finally {
                setLoading(false)
            }
        }

        if (projectId) load()
    }, [projectId])

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="p-6 rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                    Loading project...
                </div>
            </div>
        )
    }

    if (!initialValues) {
        return (
            <div className="space-y-4">
                <div className="p-6 rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-red-500">
                    Project not found
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <ProjectEditForm projectId={projectId} initialValues={initialValues} />
        </div>
    )
}
