import type { EntityType } from "@/lib/activity-log/types"

export interface ActivityLogUser {
    _id: string
    name?: string
    email?: string
    avatar?: string
    role?: number
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
