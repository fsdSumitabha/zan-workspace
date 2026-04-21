import StatusBadge from "./StatusBadge"
import InteractionCard from "./InteractionCard"
import ServiceBadge from "./ServiceBadge"
import { CLIENT_STATUS_META, CLIENT_STATUS } from "@/constants/clientStatus"
import TimeAgo from "./dayjs/TimeAgo"
import Link from "next/link"
import { Mail, Phone } from "lucide-react"
import WhatsAppLink from "./button/WhatsAppLink"

interface Props {
    id: string
    name: string
    company: string
    email?: string
    phone: string
    createdAt: string

    status: CLIENT_STATUS

    service?: "Web Development" | "Digital Marketing" | "BlockChain" | "Mobile APP" | "SEO"

    interaction?: {
        type: "MEETING" | "NOTE" | "DOCUMENT" | "PROPOSAL"
        title: string
        subtitle?: string
        time: string
        user: string
    }
}

export default function ClientCard({
    id,
    name,
    company,
    email,
    phone,
    createdAt,
    status,
    service,
    interaction
}: Props) {
    return (
        <Link
            href={`/admin/operations/clients/${id}`}
            className="
                block my-4 p-4 rounded-xl
                bg-white dark:bg-neutral-900
                border border-neutral-200 dark:border-neutral-800
                hover:border-blue-500/40
                transition cursor-pointer
            "
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {name}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {company}
                    </p>
                </div>

                <StatusBadge status={status} meta={CLIENT_STATUS_META} />
            </div>

            {/* Contact Info */}
            <div className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
                <p>
                    <Phone size={16} className="inline mr-2" />
                    {phone}
                </p>

                {email && (
                    <p>
                        <Mail size={16} className="inline mr-2" />
                        {email}
                    </p>
                )}

                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    <TimeAgo date={createdAt} />
                </p>
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