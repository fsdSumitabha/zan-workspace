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
 * Thin wrapper over `model.create`. The audit log for the create is written
 * by the Mongoose `post("save")` plugin — adding a manual log here would
 * duplicate every row. `entityType` and `actorId` are kept for call-site
 * symmetry with `auditedFindByIdAndUpdate` but are no-ops; the plugin reads
 * the actor from the audit context set by `requireAuth`.
 */
export async function auditedCreate<T extends Document>(
    model: Model<T>,
    _entityType: EntityType,
    data: UpdateQuery<T>,
    _actorId?: string | null
): Promise<T> {
    return model.create(data)
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
