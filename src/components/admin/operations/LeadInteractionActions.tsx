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
                        className={`px-3 py-1 rounded-md text-sm font-medium ${meta.color}`}
                    >
                        + {meta.label}
                    </button>
                )
            })}

        </div>
    )
}