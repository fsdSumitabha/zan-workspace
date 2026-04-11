import Link from "next/link"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"
import { SERVICE_META } from "@/constants/services"
import { ServiceType } from "@/constants/services"

import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import InteractionCard from "./InteractionCard"
import TimeAgo from "./dayjs/TimeAgo"

import { Phone, Mail, Building2, Briefcase } from "lucide-react"

interface EntityCardProps {
    item: any
}

export default function EntityCard({ item }: EntityCardProps) {
    const {
        _id,
        entityType,
        name,
        phone,
        email,
        source,
        status,
        lastInteractionAt,
        lastInteraction,

        // client/project specific
        company,
        companyName,
        title,
        serviceType,
        description
    } = item

    // -----------------------------
    // Config based on entity type
    // -----------------------------
    const config = getEntityConfig(entityType)

    const href = getHref(entityType, _id)

    return (
        <Link
            href={href}
            className="flex group gap-3 p-4 rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition"
        >
            {/* Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                    <config.Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-3">

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                            {name || title}
                        </h3>

                        {(company || companyName) && (
                            <p className="text-xs text-neutral-500 flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {company || companyName}
                            </p>
                        )}
                    </div>


                </div>

                {/* Meta Info */}
                <div className="text-xs text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">

                    {phone && (
                        <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {phone}
                        </span>
                    )}

                    {email && (
                        <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {email}
                        </span>
                    )}

                    {source && (
                        <span>{source}</span>
                    )}

                    {lastInteractionAt && (
                        <span className="flex items-center gap-1">
                            • <TimeAgo date={lastInteractionAt} />
                        </span>
                    )}
                </div>


                {/* Description (mainly project) */}
                {description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {description}
                    </p>
                )}

                {/* Interaction */}
                {lastInteraction && (
                    <div className="pt-2">
                        <InteractionCard {...lastInteraction} />
                    </div>
                )}
            </div>
        </Link>
    )
}

// -----------------------------------
// Helpers
// -----------------------------------

function getEntityConfig(type: number) {
    switch (type) {
        case ENTITY_TYPE.LEAD:
            return {
                statusMeta: LEAD_STATUS_META,
                Icon: Briefcase
            }

        case ENTITY_TYPE.CLIENT:
            return {
                statusMeta: CLIENT_STATUS_META,
                Icon: Building2
            }

        case ENTITY_TYPE.PROJECT:
            return {
                statusMeta: PROJECT_STATUS_META,
                Icon: Briefcase
            }

        default:
            return {
                statusMeta: LEAD_STATUS_META,
                Icon: Briefcase
            }
    }
}

function getHref(type: number, id: string) {
    switch (type) {
        case ENTITY_TYPE.LEAD:
            return `/admin/operations/leads/${id}`

        case ENTITY_TYPE.CLIENT:
            return `/admin/operations/clients/${id}`

        case ENTITY_TYPE.PROJECT:
            return `/admin/operations/projects/${id}`

        default:
            return "#"
    }
}