import type { Schema, Document } from "mongoose"
import mongoose from "mongoose"

import { getAuditContext } from "./auditContext"
import { logEntityChanges } from "./logEntityChanges"
import { resolveTrackedFields } from "./fieldResolution"
import { toAuditPlain } from "./normalize"
import { EntityType } from "@/constants/entityTypes"

export interface AuditPluginOptions {
    entityType: EntityType
}

const AUDIT_BEFORE_KEY = "_auditBeforeSnapshot"
const AUDIT_USER_KEY = "_auditUserId"

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
 *
 * Actor capture strategy:
 *   pre("save") snapshots the audit-context userId onto the document's
 *   $locals. post("save") prefers that snapshot over a fresh ctx read.
 *   This is defensive — across Mongoose's internal middleware hops and
 *   Promise boundaries the AsyncLocalStorage context can occasionally
 *   appear empty in post hooks even though it was set on the request
 *   handler. Capturing in pre keeps the actor on the doc itself.
 */
export function auditPlugin(
    schema: Schema,
    options: AuditPluginOptions
): void {
    const { entityType } = options

    schema.pre("save", async function () {
        const ctx = getAuditContext()
        if (ctx?.userId) {
            this.$locals[AUDIT_USER_KEY] = ctx.userId
        }

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

        const userIdFromLocals = subject.$locals[AUDIT_USER_KEY] as
            | string
            | undefined
        const userId = userIdFromLocals ?? ctx?.userId ?? null

        await safeLog(`save ${entityType}`, () =>
            logEntityChanges({
                entityType,
                entityId: String(subject._id),
                userId,
                before: beforeRaw ? toAuditPlain(beforeRaw) : null,
                after: toAuditPlain(subject),
                fields: resolveTrackedFields(schema, entityType),
            })
        )
    })
}
