import { ENTITY_TYPE, EntityType } from "./entityTypes"
import { LEAD_STATUS_META } from "./leadStatus"
import { CLIENT_STATUS_META } from "./clientStatus"
import { PROJECT_STATUS_META } from "./projectStatus"
import { MEETING_STATUS_META } from "./meetingStatus"
import { CALL_STATUS_META } from "./callStatus"

// Only entities that carry a numeric `status` field get an entry here.
// Entities without a status (USER, INTERACTION, DOCUMENT, QUOTATION)
// are intentionally absent — callers must handle a missing entry as
// "no status meta". The activity-log UI uses this map to render
// `status` field changes as colored pills with human labels.
export const STATUS_META_BY_ENTITY: Partial<
    Record<
        EntityType,
        Record<number, { label: string; color: string; decoration?: string }>
    >
> = {
    [ENTITY_TYPE.LEAD]: LEAD_STATUS_META,
    [ENTITY_TYPE.CLIENT]: CLIENT_STATUS_META,
    [ENTITY_TYPE.PROJECT]: PROJECT_STATUS_META,
    [ENTITY_TYPE.MEETING]: MEETING_STATUS_META,
    [ENTITY_TYPE.CALL]: CALL_STATUS_META,
}
