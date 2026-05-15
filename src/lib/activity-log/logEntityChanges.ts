import mongoose from "mongoose"

import ActivityLog from "@/models/ActivityLog"
import { valuesEqual } from "./normalize"
import type { LogEntityChangesInput } from "./types"

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

    const skip = new Set(skipFields)
    const entityObjectId = new mongoose.Types.ObjectId(entityId)
    const userObjectId = userId
        ? new mongoose.Types.ObjectId(userId)
        : undefined

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
