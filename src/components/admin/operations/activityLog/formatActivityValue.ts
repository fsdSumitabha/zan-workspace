import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"
import { USER_ROLE_META } from "@/constants/userRoles"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import type { EntityType } from "@/lib/activity-log/types"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

function statusLabel(entityType: EntityType, value: number): string | null {
    if (entityType === ENTITY_TYPE.LEAD && value in LEAD_STATUS_META) {
        return LEAD_STATUS_META[value as keyof typeof LEAD_STATUS_META].label
    }
    if (entityType === ENTITY_TYPE.CLIENT && value in CLIENT_STATUS_META) {
        return CLIENT_STATUS_META[value as keyof typeof CLIENT_STATUS_META]
            .label
    }
    if (entityType === ENTITY_TYPE.PROJECT && value in PROJECT_STATUS_META) {
        return PROJECT_STATUS_META[value as keyof typeof PROJECT_STATUS_META]
            .label
    }
    return null
}

/**
 * Format a single audit value (oldData / newData) for display.
 * Best-effort prettification with safe fallbacks; never throws.
 */
export function formatActivityValue(
    value: unknown,
    action: string | null,
    entityType: EntityType | null
): string {
    if (value === null || value === undefined || value === "") return "—"

    if (action === "status" && entityType && typeof value === "number") {
        return statusLabel(entityType, value) ?? String(value)
    }

    if (action === "role" && typeof value === "number") {
        const meta = USER_ROLE_META[value as keyof typeof USER_ROLE_META]
        return meta?.label ?? `Role ${value}`
    }

    if (typeof value === "boolean") return value ? "Yes" : "No"

    if (typeof value === "string") {
        if (ISO_DATE_RE.test(value)) {
            const d = new Date(value)
            if (!isNaN(d.getTime())) {
                return d.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                })
            }
        }
        if (OBJECT_ID_RE.test(value)) {
            return `${value.slice(0, 6)}…${value.slice(-4)}`
        }
        return value
    }

    if (typeof value === "number") return String(value)

    if (Array.isArray(value)) {
        if (value.length === 0) return "(empty)"
        return `[${value.length} item${value.length === 1 ? "" : "s"}]`
    }

    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

/** Convert "lastInteractionAt" → "Last interaction at". */
export function humanizeFieldName(action: string | null): string {
    if (!action) return "field"
    const spaced = action
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]+/g, " ")
        .toLowerCase()
        .trim()
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
