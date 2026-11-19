import { ENTITY_TYPE } from "@/constants/entityTypes"

/** The page of one meeting. */
export function meetingPageHref(meetingId: string): string {
    return `/admin/operations/meetings/${meetingId}`
}

/** The page of the lead, client or project a meeting belongs to. */
export function meetingParentHref(
    entityType: number | undefined,
    entityId: string | undefined
): string | null {
    if (!entityId) return null
    switch (entityType) {
        case ENTITY_TYPE.LEAD:
            return `/admin/operations/leads/${entityId}`
        case ENTITY_TYPE.CLIENT:
            return `/admin/operations/clients/${entityId}`
        case ENTITY_TYPE.PROJECT:
            return `/admin/operations/projects/${entityId}`
        default:
            return null
    }
}
