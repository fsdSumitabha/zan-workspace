import type { EntityType } from "@/lib/activity-log/types"

export interface ActivityLogUser {
    _id: string
    name?: string
    email?: string
    avatar?: string
    role?: number
}

export interface InteractionDetail {
    type: number
    parentEntityType: EntityType | null
    parentEntityId: string | null
    parentEntityName: string | null
    title: string | null
    description: string | null
}

export interface ActivityLogRow {
    _id: string
    entityType: EntityType | null
    entityId: string | null
    entityName: string | null
    action: string | null
    oldData: unknown
    newData: unknown
    user: ActivityLogUser | null
    createdAt: string
    /**
     * Populated by the API only when `entityType === INTERACTION`. The
     * UI uses this to label the row with the interaction type and link
     * back to the parent Lead/Client/Project.
     */
    interaction?: InteractionDetail | null
}

export interface ActivityLogPagination {
    page: number
    limit: number
    total: number
    pages: number
}

export interface ActivityLogResponse {
    success: boolean
    data: ActivityLogRow[]
    pagination: ActivityLogPagination
    scope: "self" | "all"
    message?: string
}

export interface ActivityLogFilterState {
    entityType: EntityType | ""
    userId: string
    from: string
    to: string
    q: string
}

export const EMPTY_FILTERS: ActivityLogFilterState = {
    entityType: "",
    userId: "",
    from: "",
    to: "",
    q: "",
}
