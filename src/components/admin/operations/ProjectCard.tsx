"use client"

import Link from "next/link"
import StatusBadge from "./StatusBadge"
import InteractionCard from "./InteractionCard"
import ServiceBadge from "./ServiceBadge"
import { PROJECT_STATUS_META, ProjectStatus } from "@/constants/projectStatus"
import TimeAgo from "./dayjs/TimeAgo"
import { ServiceType } from "@/constants/services"
import { InteractionType } from "@/constants/interactionTypes"

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

    interaction?: {
        type: InteractionType
        title: string
        subtitle?: string
        createdAt: string
        user: string
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
    interaction
}: Props) {
    return (
        <Link
            href={`/admin/operations/projects/${id}`}
            className="block my-4 p-4 rounded-xl bg-slate-100 dark:bg-neutral-950 border border-neutral-600 hover:border-blue-500/40 transition cursor-pointer"
        >
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    {/* Client (Primary) */}
                    <p className="font-semibold">{client.name}</p>
                    <p className="text-sm text-neutral-400">{client.company}</p>

                    {/* Project Title */}
                    <p className="text-sm mt-1 text-blue-400 font-medium">
                        {title}
                    </p>
                </div>

                <StatusBadge status={status} meta={PROJECT_STATUS_META} />
            </div>

            {/* Description */}
            {description && (
                <p className="mt-3 text-sm text-neutral-400 line-clamp-1">
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

            {/* Interaction */}
            {interaction && <InteractionCard {...interaction} />}
        </Link>
    )
}