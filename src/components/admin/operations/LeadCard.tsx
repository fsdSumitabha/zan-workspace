import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import InteractionCard from "./InteractionCard"
import { LEAD_STATUS_META, LEAD_STATUS } from "@/constants/leadStatus"
import TimeAgo from "./dayjs/TimeAgo"
import Link from "next/link"
import { SquaresIntersect } from "lucide-react"
import ConvertButton from "./ConvertClientButton"


interface Props {
    id: string
    name: string
    company?: string
    email?: string
    phone: string
    source: string
    createdAt: string
    service?: "Web Development" | "Digital Marketing" | "BlockChain" | "Mobile APP" | "SEO"
    status: LEAD_STATUS
    interaction?: {
        type: "MEETING" | "NOTE" | "DOCUMENT" | "PROPOSAL"
        title: string
        subtitle?: string
        time: string
        user: string
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
    service,
    status,
    interaction
}: Props & { id: string }) {
    return (
        <Link href={`/admin/operations/leads/${id}`} className="block my-4 p-4 rounded-xl bg-slate-100 dark:bg-neutral-950 border border-neutral-600 hover:border-blue-500/40 transition cursor-pointer">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold">{name}</p>
                    <p className="text-sm text-neutral-400">{company}</p>
                </div>

                <div className="flex items-center gap-2">
                    <StatusBadge status={status} meta={LEAD_STATUS_META} />
                </div>
            </div>

            {/* Contact Info */}
            <div className="relative mt-3 text-sm text-neutral-300 space-y-1">
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

            {/* Service */}
            <div className="flex gap-2 mt-3">
                {service && <ServiceBadge service={service} />}
            </div>

            {/* Interaction */}
            {interaction && <InteractionCard {...interaction} />}
        </Link>
    )
}