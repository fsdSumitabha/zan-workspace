"use client"

import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import TimeAgo from "./dayjs/TimeAgo"

import { ProjectStatus, PROJECT_STATUS_META } from "@/constants/projectStatus"
import { Project } from "@/types/projects"

type Props = {
    project: Project
}

export default function ProjectDetail({ project }: Props) {
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

                <StatusBadge status={project.status} meta={PROJECT_STATUS_META} />
            </div>

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
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Timeline
                </h3>

                <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <div>
                        Created: <TimeAgo date={project.createdAt} />
                    </div>
                    <div>
                        Last Updated: <TimeAgo date={project.updatedAt} />
                    </div>
                </div>
            </div>

            {/* ================= PLACEHOLDER SECTIONS ================= */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">

                <h3 className="text-sm font-medium text-gray-500">
                    Activity & Extensions
                </h3>

                <div className="grid sm:grid-cols-3 gap-4 text-sm">

                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700 text-center">
                        Meetings
                    </div>

                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700 text-center">
                        Documents
                    </div>

                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700 text-center">
                        Payments
                    </div>

                </div>
            </div>
        </div>
    )
}