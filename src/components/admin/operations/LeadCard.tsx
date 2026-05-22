import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import InteractionCard from "./InteractionCard"
import { LEAD_STATUS_META, LeadStatus, LEAD_STATUS } from "@/constants/leadStatus"
import TimeAgo from "./dayjs/TimeAgo"
import Link from "next/link"
import { SquaresIntersect } from "lucide-react"
import ConvertButton from "./ConvertClientButton"
import { UserRole } from "@/constants/userRoles"
import Tooltip from "./tooltip/Tooltip"


interface Props {
    id: string
    name: string
    company?: string
    email?: string
    phone: string
    source: string
    createdAt: string
    status: LeadStatus
    createdBy?: {
        _id: string
        name: string
        email: string
        role: UserRole
    }
}

export default function LeadCard({
    id,
    name,
    company,
    email,
    phone,
    source,
    createdAt,
    status,
    createdBy
}: Props & { id: string }) {
    return (
        <Link href={`/admin/operations/leads/${id}`} className="block my-4 p-4 rounded-lg dark:rounded-xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-600 shadow hover:shadow-md hover:border-blue-500/40 transition cursor-pointer">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-neutral-900 dark:text-white">{name}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{company}</p>
                </div>

                <div className="flex items-center gap-2">
                    <StatusBadge status={status} meta={LEAD_STATUS_META} />
                </div>
            </div>

            {/* Contact Info */}
            <div className="relative mt-3 text-sm text-neutral-600 dark:text-neutral-300 space-y-1">
                <p>{phone}</p>
                {email && <p>{email}</p>}
                <p className="text-xs text-neutral-500 flex gap-1 items-center">
                    <span>{source}</span>
                    <span>•</span>
                    <TimeAgo date={createdAt} />
                </p>
                <div className="absolute top-1/2 right-0 -translate-y-1/2">
                    {status === LEAD_STATUS.NEGOTIATION && <ConvertButton id={id} />}
                </div>
            </div>

            {createdBy && (
                <Tooltip content={`Created by ${createdBy.name} `} />
            )}
        </Link>
    )
}