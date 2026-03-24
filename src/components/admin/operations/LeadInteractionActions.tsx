"use client"

import {
    INTERACTION_TYPE,
    INTERACTION_TYPE_META,
    InteractionType
} from "@/constants/interactionTypes"

interface Props {
    leadId: string
    onAction?: (type: InteractionType) => void
}

const ACTION_TYPES: InteractionType[] = [
    INTERACTION_TYPE.CALL_MADE,
    INTERACTION_TYPE.MEETING_SCHEDULED,
    INTERACTION_TYPE.NOTE_ADDED,
    INTERACTION_TYPE.DOCUMENT_UPLOADED,
    INTERACTION_TYPE.PROPOSAL_SENT
]

function getColorClasses(color: string) {
    switch (color) {
        case "blue":
            return "bg-blue-600 text-white"
        case "green":
            return "bg-green-600 text-white"
        case "red":
            return "bg-red-600 text-white"
        case "yellow":
            return "bg-yellow-500 text-black"
        case "purple":
            return "bg-purple-600 text-white"
        case "gray":
            return "bg-gray-600 text-white"
        case "teal":
            return "bg-teal-600 text-white"
        case "orange":
            return "bg-orange-600 text-white"
        default:
            return "bg-gray-500 text-white"
    }
}

export default function LeadInteractionActions({
    leadId,
    onAction
}: Props) {
    return (
        <div className="flex flex-wrap gap-2 p-4 rounded-xl border bg-white dark:bg-neutral-900">

            {ACTION_TYPES.map((type) => {
                const meta = INTERACTION_TYPE_META[type]

                return (
                    <button
                        key={type}
                        onClick={() => onAction?.(type)}
                        className={`px-3 py-1 rounded-md text-sm font-medium
                        ${getColorClasses(meta.color)}`}
                    >
                        + {meta.label}
                    </button>
                )
            })}

        </div>
    )
}