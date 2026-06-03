import { EntityType } from "@/constants/entityTypes"

export interface EntityAuditConfig {
    /**
     * Strict allowlist. When omitted (recommended), every schema field is
     * tracked except global system fields, sensitive-name matches, and
     * `skipFields`. Set this only when you want explicit control.
     */
    trackedFields?: readonly string[]

    /** Fields excluded from auditing for this entity. */
    skipFields?: readonly string[]
}

/**
 * Audit configuration overrides per entity. Entries are optional — a new
 * model becomes auto-audited the moment it calls `ensureAuditPlugin`.
 *
 * Add an entry here only when you need to:
 *   - skip a non-sensitive field (sensitive names like `password`, `token`,
 *     `secret`, `apiKey` are already filtered by SENSITIVE_FIELD_PATTERN), or
 *   - opt into strict-allowlist mode via `trackedFields`.
 */
export const ENTITY_AUDIT_CONFIG: Partial<Record<EntityType, EntityAuditConfig>> = {
    4: {
        // `password` is auto-skipped by the sensitive-name pattern; listed
        // here as an extra belt-and-braces guard. `lastLoginAt` is noisy.
        skipFields: ["password", "lastLoginAt"],
    },
}
