/** Lead/client/project parent entities updated from calls, meetings, notes, quotations. */
export type ParentAuditEntityType = "LEAD" | "CLIENT" | "PROJECT"

/** Maps interaction `entityType` number (0/1/2) to audit entityType. */
export const NUMERIC_ENTITY_TO_AUDIT: Record<number, ParentAuditEntityType> = {
    0: "LEAD",
    1: "CLIENT",
    2: "PROJECT",
}
