"use client"

import {
    INTERACTION_TYPE,
    INTERACTION_TYPE_META,
    InteractionType
} from "@/constants/interactionTypes"

interface Props {
    leadId: string
    onAction?: (type: InteractionType) => void
    activeType?: InteractionType | null
}

const ACTION_TYPES: InteractionType[] = [
    INTERACTION_TYPE.CALL_MADE,
    INTERACTION_TYPE.MEETING_SCHEDULED,
    INTERACTION_TYPE.NOTE_ADDED,
    INTERACTION_TYPE.DOCUMENT_UPLOADED,
    INTERACTION_TYPE.PROPOSAL_SENT
]


export default function LeadInteractionActions({
    leadId,
    onAction,
    activeType
}: Props) {
    return (
        <div className="flex flex-wrap gap-4 p-4 rounded-xl border bg-white dark:bg-neutral-900">

            {ACTION_TYPES.map((type) => {
                const meta = INTERACTION_TYPE_META[type]
                const isActive = activeType === type

                return (
                    <button
                        key={type}
                        onClick={() => onAction?.(type)}
                        className={`
                            px-3 py-1 rounded-md text-sm font-medium transition

                            ${isActive
                                ? "ring-2 ring-blue-500 scale-105"
                                : "opacity-80 hover:opacity-100"
                            }

                            ${meta.color}
                        `}
                    >
                        + {meta.label}
                    </button>
                )
            })}

        </div>
    )
}