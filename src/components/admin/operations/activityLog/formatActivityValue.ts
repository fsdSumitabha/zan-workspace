import { USER_ROLE_META } from "@/constants/userRoles"
import { ENTITY_TYPE, ENTITY_TYPE_META } from "@/constants/entityTypes"
import { STATUS_META_BY_ENTITY } from "@/constants/statusMetaByEntity"
import type { EntityType } from "@/lib/activity-log/types"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

/**
 * Activity-log rows may arrive with `entityType` as either the numeric
 * code (canonical) or the legacy uppercase string ("LEAD", "CLIENT",
 * etc.) depending on when the row was written. This collapses both
 * forms to the numeric `EntityType` for downstream lookups.
 */
export function normalizeEntityType(et: unknown): EntityType | null {
    if (et === null || et === undefined || et === "") return null
    if (typeof et === "number") {
        return et in ENTITY_TYPE_META ? (et as EntityType) : null
    }
    if (typeof et === "string") {
        const key = et.toUpperCase()
        const map = ENTITY_TYPE as Record<string, number>
        if (key in map) return map[key] as EntityType
    }
    return null
}

function statusLabel(entityType: EntityType, value: number): string | null {
    return STATUS_META_BY_ENTITY[entityType]?.[value]?.label ?? null
}

/**
 * Format a single audit value (oldData / newData) for display.
 * Best-effort prettification with safe fallbacks; never throws.
 */
export function formatActivityValue(
    value: unknown,
    action: string | null,
    entityType: EntityType | string | null
): string {
    if (value === null || value === undefined || value === "") return "—"

    // Normalize because the row may carry either a numeric code or the
    // legacy "LEAD"/"CLIENT" string form.
    const normalized = normalizeEntityType(entityType)

    if (action === "status" && normalized !== null && typeof value === "number") {
        return statusLabel(normalized, value) ?? String(value)
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
