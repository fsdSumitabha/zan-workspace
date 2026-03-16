import StatusBadge from "./StatusBadge"
import ServiceBadge from "./ServiceBadge"
import InteractionCard from "./InteractionCard"

interface Props {
    name: string
    company: string
    service: "Web Development" | "Digital Marketing" | "BlockChain" | "Mobile APP" | "SEO"
    status: | "NEW_LEAD" | "CONTACTED" | "MEETING_SCHEDULED" | "DISCUSSION" | "NEGOTIATION" | "ACTIVE" | "IN_PROGRESS" | "MAINTENANCE" | "COMPLETED"
    interaction: {
        type: "MEETING" | "NOTE" | "DOCUMENT" | "PROPOSAL"
        title: string
        subtitle?: string
        time: string
        user: string
    }
}

export default function ContactCard({ name, company, service, status, interaction }: Props) {
    return (
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-neutral-950 border border-neutral-600 hover:border-blue-500/40 transition cursor-pointer">

            <div className="flex items-center justify-between">

                <div>
                    <p className="font-semibold">{name}</p>
                    <p className="text-sm text-neutral-400">{company}</p>
                </div>

                <StatusBadge status={status} />

            </div>

            <div className="flex gap-2 mt-3">
                <ServiceBadge service={service} />
            </div>

            <InteractionCard {...interaction} />

        </div>
    )
}
