import { Calendar, StickyNote, FileText, FileSignature } from "lucide-react"

type InteractionType = | "MEETING" | "NOTE" | "DOCUMENT" | "PROPOSAL"

interface Props {
    type: InteractionType
    title: string
    subtitle?: string
    time: string
    user: string
}

const typeStyles = {
    MEETING: {
        border: "border-blue-500/50",
        icon: Calendar,
        iconColor: "text-blue-500"
    },
    NOTE: {
        border: "border-amber-500/50",
        icon: StickyNote,
        iconColor: "text-amber-500"
    },
    DOCUMENT: {
        border: "border-emerald-500/50",
        icon: FileText,
        iconColor: "text-emerald-500"
    },
    PROPOSAL: {
        border: "border-purple-500/50",
        icon: FileSignature,
        iconColor: "text-purple-500"
    }
}

export default function InteractionCard({ type, title, subtitle, time, user }: Props) {

    const config = typeStyles[type]
    const Icon = config.icon

    return (
        <div
            className={`mt-3 p-3 rounded-lg bg-neutral-200 dark:bg-neutral-900 border  pl-4 border-l-4 ${config.border}`}
            title={`Updated by ${user}`}
        >
            <div className="flex items-start gap-2">

                <Icon size={16} className={`mt-[2px] ${config.iconColor}`} />

                <div className="flex-1">

                    <p className="text-sm font-medium"> {title} </p>

                    {subtitle && ( <p className="text-xs text-neutral-400 mt-1"> {subtitle} </p> )}

                    <p className="text-xs text-neutral-500 mt-2"> {time} </p>

                </div>
            </div>
        </div>
    )
}