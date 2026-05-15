import type { Document, Model, QueryOptions, Types, UpdateQuery } from "mongoose"

import { getAuditContext } from "./auditContext"
import { logEntityChanges } from "./logEntityChanges"
import { toAuditPlain } from "./normalize"
import { ENTITY_AUDIT_CONFIG } from "./registry"
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
    entityType: EntityType,
    entityId: string,
    userId: string | null,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null
): Promise<void> {
    const ctx = getAuditContext()
    if (ctx?.disabled || !after) return

    const config = ENTITY_AUDIT_CONFIG[entityType]
    await logEntityChanges({
        entityType,
        entityId,
        userId,
        before,
        after,
        fields: config.trackedFields,
        skipFields: config.skipFields,
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
            entityType,
            String(after._id),
            userId,
            before ? toAuditPlain(before) : null,
            toAuditPlain(after)
        )
    }

    return after
}

export async function auditedCreate<T extends Document>(
    model: Model<T>,
    entityType: EntityType,
    data: UpdateQuery<T>,
    actorId?: string | null
): Promise<T> {
    const created = await model.create(data)
    const userId = actorId ?? getAuditContext()?.userId ?? null

    await writeAuditLog(
        entityType,
        String(created._id),
        userId,
        null,
        toAuditPlain(created)
    )

    return created
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
