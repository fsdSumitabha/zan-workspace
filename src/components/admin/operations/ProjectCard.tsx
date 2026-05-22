"use client"

import Link from "next/link"
import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import { PROJECT_STATUS_META, ProjectStatus } from "@/constants/projectStatus"
import TimeAgo from "./dayjs/TimeAgo"
import { ServiceType } from "@/constants/services"

import Tooltip from "./tooltip/Tooltip"

interface Props {
    id: string
    client: {
        id: string
        name: string
        company: string
    }
    title: string
    description?: string
    serviceType?: ServiceType
    status: ProjectStatus
    budget?: number
    createdAt: string
    createdBy?: {
        _id: string
        name: string
        email: string
    }
}

export default function ProjectCard({
    id,
    client,
    title,
    description,
    serviceType,
    status,
    budget,
    createdAt,
    createdBy
}: Props) {
    return (
        <Link
            href={`/admin/operations/projects/${id}`}
            className="block my-4 p-4 rounded-lg dark:rounded-xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-600 shadow hover:shadow-md hover:border-blue-500/40 transition cursor-pointer"
        >
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    {/* Client (Primary) */}
                    <p className="font-semibold text-neutral-900 dark:text-white">{client.name}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{client.company}</p>

                    {/* Project Title */}
                    <p className="text-sm mt-1 text-blue-600 dark:text-blue-400 font-medium">
                        {title}
                    </p>
                </div>

                <StatusBadge status={status} meta={PROJECT_STATUS_META} />
            </div>

            {/* Description */}
            {description && (
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-1">
                    {description}
                </p>
            )}

            {/* Meta Info */}
            <div className="mt-3 text-xs text-neutral-500 flex flex-wrap gap-2 items-center">
                {budget && (
                    <>
                        <span>₹{budget.toLocaleString()}</span>
                        <span>•</span>
                    </>
                )}

                <TimeAgo date={createdAt} />
            </div>

            {/* Service */}
            <div className="flex gap-2 mt-3">
                {serviceType && <ServiceBadge service={serviceType as any} />}
            </div>
            {createdBy && (
                <Tooltip content={`Created by ${createdBy.name} `} />
            )}
        </Link>
    )
}