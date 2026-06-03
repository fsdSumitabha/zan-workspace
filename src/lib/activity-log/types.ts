import { EntityType } from "@/constants/entityTypes"

export type { EntityType }

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
