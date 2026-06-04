import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import MeetingItem from "./types/MeetingItem"
import NoteItem from "./types/NoteItem"
import QuotationItem from "./types/Quotationtem"
import StatusChangeItem from "./types/StatusChangeItem"
import CallItem from "./types/CallItem"

export default function InteractionItem({ entityType, item, onChanged }: { entityType: number; item: any; onChanged?: () => void }) {
    switch (item.type) {
        case INTERACTION_TYPE.MEETING_SCHEDULED:
        case INTERACTION_TYPE.MEETING_RESCHEDULED:
        case INTERACTION_TYPE.MEETING_CANCELLED:
        case INTERACTION_TYPE.MEETING_MISSED:
        case INTERACTION_TYPE.MEETING_COMPLETED:
            return <MeetingItem item={item} onChanged={onChanged} />
        case INTERACTION_TYPE.NOTE_ADDED:
            return <NoteItem item={item} />
        case INTERACTION_TYPE.QUOTATION_SENT:
            return <QuotationItem item={item} />
        case INTERACTION_TYPE.STATUS_CHANGED:
            return <StatusChangeItem entityType={entityType} item={item} />
        case INTERACTION_TYPE.CALL_MADE:
            return <CallItem item={item} />

        default:
            return null
    }
}