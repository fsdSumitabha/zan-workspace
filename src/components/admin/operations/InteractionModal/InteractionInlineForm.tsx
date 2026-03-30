"use client"

import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import CallForm from "./CallForm"
import MeetingForm from "./MeetingForm"
import NoteForm from "./NoteForm"

export default function InteractionInlineForm({
    type,
    leadId,
    onClose,
    onSuccess
}: any) {
    if (!type) return null

    return (
        <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-700 space-y-4">

            <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg">Add Interaction</h2>

                <button
                    onClick={onClose}
                    className="text-sm text-gray-500"
                >
                    Close
                </button>
            </div>

            {type === INTERACTION_TYPE.CALL_MADE && (
                <CallForm leadId={leadId} onClose={onClose} onSuccess={onSuccess} />
            )}

            {type === INTERACTION_TYPE.MEETING_SCHEDULED && (
                <MeetingForm leadId={leadId} onClose={onClose} onSuccess={onSuccess} />
            )}

            {type === INTERACTION_TYPE.NOTE_ADDED && (
                <NoteForm leadId={leadId} onClose={onClose} onSuccess={onSuccess} />
            )}

        </div>
    )
}