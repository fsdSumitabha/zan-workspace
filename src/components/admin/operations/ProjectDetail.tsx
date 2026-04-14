"use client"

import { useState } from "react"
import { toast } from "sonner"
import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import TimeAgo from "./dayjs/TimeAgo"

import { ProjectStatus, PROJECT_STATUS_META } from "@/constants/projectStatus"
import { Project } from "@/types/projects"
import ProjectStatusDropdown from "./statusDropdowns/ProjectStatusDropdown"


type Props = {
    project: Project
    onStatusChange?: (status: ProjectStatus, remarks: string) => Promise<void>
}

export default function ProjectDetail({ project, onStatusChange }: Props) {
    const [pendingStatus, setPendingStatus] = useState<ProjectStatus | null>(null)
    const [remarks, setRemarks] = useState("")
    const [saving, setSaving] = useState(false)

    const handleStatusSelect = (status: ProjectStatus) => {
        if (status === project.status) return
        setPendingStatus(status)
        setRemarks("")
    }

    const handleConfirm = async () => {
        if (!remarks.trim()) {
            toast.error("Remarks are required")
            return
        }
        if (!pendingStatus || !onStatusChange) return

        setSaving(true)
        try {
            await onStatusChange(pendingStatus, remarks)
            setPendingStatus(null)
            setRemarks("")
        } catch (err: any) {
            toast.error(err?.message || "Failed to update status")
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setPendingStatus(null)
        setRemarks("")
    }
    return (
        <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-6">

            {/* ================= HEADER ================= */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold">
                        {project.title}
                    </h2>

                    <p className="text-sm text-gray-500 mt-1">
                        {project.clientId.company} • {project.clientId.name}
                    </p>
                </div>

                {onStatusChange ? (
                    <ProjectStatusDropdown
                        currentStatus={project.status}
                        onSelect={handleStatusSelect}   // just signals selection, no API call here
                    />
                ) : (
                    <StatusBadge status={project.status} meta={PROJECT_STATUS_META} />
                )}
            </div>
            
            {pendingStatus && (
                <>
                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    <div className="space-y-2">
                        <p className="text-sm font-medium">
                            Change to "{PROJECT_STATUS_META[pendingStatus].label}"
                        </p>

                        <textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Add remarks (required)"
                            rows={3}
                            className="w-full p-2 text-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={handleCancel}
                                className="text-xs px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={saving}
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                                {saving ? "Saving..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ================= META ================= */}
            <div className="flex flex-wrap items-center gap-3">
                {project.serviceType && (
                    <ServiceBadge service={project.serviceType} />
                )}
            </div>

            {/* ================= DESCRIPTION ================= */}
            {project.description && (
                <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">
                        Description
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {project.description}
                    </p>
                </div>
            )}

            {/* ================= BUDGET ================= */}
            <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Budget Overview
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">

                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <p className="text-xs text-gray-500">Estimated</p>
                        <p className="text-lg font-semibold">
                            ₹{project.budget?.toLocaleString() || "—"}
                        </p>
                    </div>

                    {/* Future ready blocks */}
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <p className="text-xs text-gray-500">Paid</p>
                        <p className="text-lg font-semibold text-green-600">
                            ₹—
                        </p>
                    </div>

                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <p className="text-xs text-gray-500">Due</p>
                        <p className="text-lg font-semibold text-red-500">
                            ₹—
                        </p>
                    </div>
                </div>
            </div>

            {/* ================= TIMELINE ================= */}
            <div>
                <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <div>
                        Updated: <TimeAgo date={project.updatedAt} />
                    </div>
                </div>
            </div>
        </div>
    )
}