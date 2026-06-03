import type { Schema } from "mongoose"

import { ENTITY_AUDIT_CONFIG } from "./registry"
import { EntityType } from "@/constants/entityTypes"

/** Mongoose-managed / framework fields. Never logged regardless of entity. */
export const GLOBAL_SKIP_FIELDS: ReadonlySet<string> = new Set([
    "_id",
    "id",
    "__v",
    "createdAt",
    "updatedAt",
])

/**
 * Name patterns considered secret/PII. Matched fields are never logged
 * even if a developer forgets to skip them — safety net for the
 * track-by-default behavior.
 */
export const SENSITIVE_FIELD_PATTERN =
    /password|secret|token|hash|salt|apikey|api_key|privatekey|private_key/i

/**
 * Resolves the list of fields to audit for an entity.
 *
 * - If the registry sets `trackedFields`, that is used as a strict allowlist
 *   (legacy behavior — use when you want explicit control).
 * - Otherwise, every TOP-LEVEL schema field is tracked minus: global system
 *   fields, sensitive-name matches, and the entity's `skipFields`.
 *
 * Returns top-level field names only. Mongoose exposes nested object paths
 * as dotted entries in `schema.paths` (e.g. `external.provider`), but the
 * differ reads them as flat keys on plain objects — so we collapse to the
 * top-level key and let the differ JSON-compare the whole subtree.
 *
 * New models work with zero registry config; add an entry only to skip
 * a non-sensitive field or to switch back to strict allowlist mode.
 */
export function resolveTrackedFields(
    schema: Schema,
    entityType: EntityType
): string[] {
    const config = ENTITY_AUDIT_CONFIG[entityType]
    const entitySkip = new Set(config?.skipFields ?? [])

    if (config?.trackedFields && config.trackedFields.length > 0) {
        return config.trackedFields.filter((f) => !entitySkip.has(f))
    }

    const topLevel = new Set(
        Object.keys(schema.paths).map((p) => p.split(".")[0])
    )

    return [...topLevel].filter((field) => {
        if (GLOBAL_SKIP_FIELDS.has(field)) return false
        if (SENSITIVE_FIELD_PATTERN.test(field)) return false
        if (entitySkip.has(field)) return false
        return true
    })
}
