import { INTERACTION_TYPE_META,InteractionType } from "@/constants/interactionTypes"

import TimeAgo from "./dayjs/TimeAgo"
import { Calendar, Check, X, RefreshCw, FileText, Phone, Briefcase, ArrowLeftRight } from "lucide-react"

function getIcon(name: string) {
    switch (name) {
        case "calendar":
            return Calendar
        case "check":
            return Check
        case "times":
            return X
        case "refresh":
            return RefreshCw
        case "file":
            return FileText
        case "phone":
            return Phone
        case "doc":
            return FileText
        case "briefcase":
            return Briefcase
        case "exchange-alt":
            return ArrowLeftRight
        default:
            return FileText
    }
}

interface Props {
    type: InteractionType
    title: string
    subtitle?: string
    createdAt: string
    user?: string
}

export default function InteractionCard({
    type,
    title,
    subtitle,
    createdAt,
    user
}: Props) {

    const meta = INTERACTION_TYPE_META[type] || INTERACTION_TYPE_META[2110] // fallback: NOTE_ADDED

    const Icon = getIcon(meta.icon)

    return (
        <div
            className={`mt-3 p-3 rounded-lg pl-4 border-l-4 ${meta.color}`}
            title={user ? `Updated by ${user}` : ""}
        >
            <div className="flex items-start gap-2">

                <Icon className="w-4 h-4 mt-[2px]" />

                <div className="flex-1">

                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                            {title}
                        </p>

                        <span className="text-[10px] px-2 py-[2px] rounded bg-black/5 dark:bg-white/10">
                            {meta.label}
                        </span>
                    </div>

                    {subtitle && (
                        <p className="text-xs text-neutral-500 mt-1">
                            {subtitle}
                        </p>
                    )}

                    <p className="text-xs text-neutral-400 mt-2">
                        <TimeAgo date={createdAt} />
                    </p>
                </div>
            </div>
        </div>
    )
}