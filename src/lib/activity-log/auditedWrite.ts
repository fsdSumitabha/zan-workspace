import type { Document, Model, QueryOptions, Schema, Types, UpdateQuery } from "mongoose"

import { getAuditContext } from "./auditContext"
import { logEntityChanges } from "./logEntityChanges"
import { resolveTrackedFields } from "./fieldResolution"
import { toAuditPlain } from "./normalize"
import type { EntityType } from "./types"
import { NUMERIC_ENTITY_TO_AUDIT } from "./entityTypeMap"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"

type Id = string | Types.ObjectId

const MODEL_BY_AUDIT_TYPE = {
    LEAD: Lead,
    CLIENT: Client,
    PROJECT: Project,
} as const

async function writeAuditLog(
    schema: Schema,
    entityType: EntityType,
    entityId: string,
    userId: string | null,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null
): Promise<void> {
    const ctx = getAuditContext()
    if (ctx?.disabled || !after) return

    await logEntityChanges({
        entityType,
        entityId,
        userId,
        before,
        after,
        fields: resolveTrackedFields(schema, entityType),
    })
}

/**
 * Reliable audit logging for Next.js route handlers (awaited in-request).
 * DB update always completes; audit failures are logged, not thrown.
 */
export async function auditedFindByIdAndUpdate<T extends Document>(
    model: Model<T>,
    entityType: EntityType,
    id: Id,
    update: UpdateQuery<T>,
    options: QueryOptions<T> = {},
    actorId?: string | null
): Promise<T | null> {
    const before = await model.findById(id).lean()
    const after = await model.findByIdAndUpdate(id, update, {
        ...options,
        returnDocument: "after",
        runValidators: options.runValidators ?? true,
    })

    const userId = actorId ?? getAuditContext()?.userId ?? null

    if (after) {
        await writeAuditLog(
            model.schema,
            entityType,
            String(after._id),
            userId,
            before ? toAuditPlain(before) : null,
            toAuditPlain(after)
        )
    }

    return after
}

/**
 * Audit-aware create. Equivalent to `new model(data).save()` but stamps
 * the actor onto `doc.$locals._auditUserId` BEFORE save runs, so the
 * Mongoose plugin's `post("save")` can attach the correct userId to the
 * activity log row.
 *
 * Why we don't rely on AsyncLocalStorage alone: ALS context set in the
 * route handler (via `enterAuditContext` inside `requireAuth`) does not
 * reliably propagate into Mongoose's save middleware in this stack
 * (observed: `getAuditContext()` returns undefined in pre/post save even
 * after the handler awaited an ALS-setting call). Passing the actor
 * explicitly is deterministic.
 *
 * `entityType` is retained for call-site symmetry with
 * `auditedFindByIdAndUpdate` and may be used for typing/logging hooks
 * later. It's not consulted today.
 */
export async function auditedCreate<T extends Document>(
    model: Model<T>,
    _entityType: EntityType,
    data: UpdateQuery<T>,
    actorId?: string | null
): Promise<T> {
    const userId = actorId ?? getAuditContext()?.userId ?? null

    // `new model(data)` is correctly typed via Mongoose's Model interface.
    // The cast is required because Mongoose's constructor type doesn't
    // expose the per-call generic.
    const doc = new model(data as unknown as Partial<T>) as T

    if (userId) {
        doc.$locals._auditUserId = userId
    }

    return doc.save() as Promise<T>
}

/** Audit update on lead/client/project from numeric entityType (0/1/2). */
export async function auditedUpdateByNumericEntityType(
    entityTypeNum: number,
    entityId: Id,
    update: Record<string, unknown>,
    actorId: string
): Promise<void> {
    const auditType = NUMERIC_ENTITY_TO_AUDIT[entityTypeNum]
    if (!auditType) return

    const model = MODEL_BY_AUDIT_TYPE[auditType]
    await auditedFindByIdAndUpdate(
        model,
        auditType,
        entityId,
        update,
        {},
        actorId
    )
}
