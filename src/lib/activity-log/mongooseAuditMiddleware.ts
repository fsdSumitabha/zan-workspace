import type { Schema, Document } from "mongoose"
import mongoose from "mongoose"

import { getAuditContext } from "./auditContext"
import { logEntityChanges } from "./logEntityChanges"
import { ENTITY_AUDIT_CONFIG } from "./registry"
import { toAuditPlain } from "./normalize"
import type { EntityType } from "./types"

export interface AuditPluginOptions {
    entityType: EntityType
}

const AUDIT_BEFORE_KEY = "_auditBeforeSnapshot"

async function safeLog(
    label: string,
    fn: () => Promise<unknown>
): Promise<void> {
    try {
        await fn()
    } catch (error) {
        console.error(`[activity-log] ${label} failed:`, error)
    }
}

/**
 * Mongoose middleware for .save() / .create().
 * For findByIdAndUpdate in API routes use auditedFindByIdAndUpdate() instead.
 */
export function auditPlugin(
    schema: Schema,
    options: AuditPluginOptions
): void {
    const { entityType } = options
    const config = ENTITY_AUDIT_CONFIG[entityType]

    schema.pre("save", async function () {
        if (this.isNew) {
            this.$locals._auditIsCreate = true
            return
        }

        const Model = this.constructor as mongoose.Model<Document>
        const existing = await Model.findById(this._id).lean()
        this.$locals[AUDIT_BEFORE_KEY] = existing
    })

    schema.post("save", async function (doc) {
        const ctx = getAuditContext()
        if (ctx?.disabled) return

        const subject = (doc ?? this) as Document
        const beforeRaw = subject.$locals._auditIsCreate
            ? null
            : (subject.$locals[AUDIT_BEFORE_KEY] as
                  | Record<string, unknown>
                  | undefined)

        await safeLog(`save ${entityType}`, () =>
            logEntityChanges({
                entityType,
                entityId: String(subject._id),
                userId: ctx?.userId ?? null,
                before: beforeRaw ? toAuditPlain(beforeRaw) : null,
                after: toAuditPlain(subject),
                fields: config.trackedFields,
                skipFields: config.skipFields,
            })
        )
    })
}
