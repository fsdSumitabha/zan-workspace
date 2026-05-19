import mongoose from "mongoose"

import ActivityLog from "@/models/ActivityLog"
import { valuesEqual } from "./normalize"
import type { LogEntityChangesInput } from "./types"

/**
 * Action markers used for whole-document lifecycle events. The frontend
 * branches on these to render single-row "created" / "deleted" entries
 * instead of one row per field.
 *
 * For an UPDATE, `action` is the changed field name (e.g. "status").
 */
export const ACTION_CREATE = "CREATE"
export const ACTION_DELETE = "DELETE"

export async function logEntityChanges(
    input: LogEntityChangesInput
): Promise<number> {
    const {
        entityType,
        entityId,
        userId,
        before,
        after,
        fields,
        skipFields = [],
    } = input

    const entityObjectId = new mongoose.Types.ObjectId(entityId)
    const userObjectId = userId
        ? new mongoose.Types.ObjectId(userId)
        : undefined

    // CREATE: no prior state, doc now exists. Emit ONE marker row instead
    // of one row per field.
    if (!before && after) {
        try {
            await ActivityLog.create({
                entityType,
                entityId: entityObjectId,
                action: ACTION_CREATE,
                oldData: null,
                newData: entityId,
                ...(userObjectId && { userId: userObjectId }),
            })
            return 1
        } catch (error) {
            console.error("[activity-log] CREATE log failed:", error)
            return 0
        }
    }

    // DELETE: soft-delete transition (deletedAt was null/absent, now set).
    // Collapse to one marker row; the per-field deletedAt/deletedBy rows
    // would be redundant since the userId column already captures who.
    const wasDeleted = !!(before && before.deletedAt)
    const isDeleted = !!(after && after.deletedAt)
    if (!wasDeleted && isDeleted) {
        try {
            await ActivityLog.create({
                entityType,
                entityId: entityObjectId,
                action: ACTION_DELETE,
                oldData: entityId,
                newData: null,
                ...(userObjectId && { userId: userObjectId }),
            })
            return 1
        } catch (error) {
            console.error("[activity-log] DELETE log failed:", error)
            return 0
        }
    }

    // UPDATE: per-field diff.
    const skip = new Set(skipFields)
    const ops: Array<{
        entityType: typeof entityType
        entityId: mongoose.Types.ObjectId
        action: string
        oldData: unknown
        newData: unknown
        userId?: mongoose.Types.ObjectId
    }> = []

    for (const field of fields) {
        if (skip.has(field)) continue

        const oldVal = before?.[field]
        const newVal = after?.[field]

        if (!valuesEqual(oldVal, newVal)) {
            ops.push({
                entityType,
                entityId: entityObjectId,
                action: field,
                oldData: oldVal ?? null,
                newData: newVal ?? null,
                ...(userObjectId && { userId: userObjectId }),
            })
        }
    }

    if (ops.length === 0) {
        return 0
    }

    try {
        await ActivityLog.insertMany(ops)
        return ops.length
    } catch (error) {
        console.error("[activity-log] insertMany failed:", error, { ops })
        return 0
    }
}
