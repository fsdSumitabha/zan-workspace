import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import MeetingItem from "./types/MeetingItem"
import NoteItem from "./types/NoteItem"

export default function InteractionItem({ item }: { item: any }) {
    switch (item.type) {
        case INTERACTION_TYPE.MEETING_SCHEDULED:
        case INTERACTION_TYPE.MEETING_COMPLETED:
        case INTERACTION_TYPE.MEETING_CANCELLED:
        case INTERACTION_TYPE.MEETING_RESCHEDULED:
            return <MeetingItem item={item} />
        case INTERACTION_TYPE.NOTE_ADDED:
            return <NoteItem item={item} />

        default:
            return null
    }
}