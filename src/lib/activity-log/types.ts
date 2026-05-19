export const ENTITY_TYPES = [
    "USER",
    "LEAD",
    "CLIENT",
    "PROJECT",
    "INTERACTION",
    "CALL",
    "MEETING",
    "DOCUMENT",
    "QUOTATION",
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]

export interface AuditContextStore {
    userId: string | null
    disabled?: boolean
}

export interface LogEntityChangesInput {
    entityType: EntityType
    entityId: string
    userId?: string | null
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
    fields: readonly string[]
    skipFields?: readonly string[]
}
