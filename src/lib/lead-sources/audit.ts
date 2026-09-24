import { Types, type Model } from "mongoose"
import ActivityLog from "@/models/ActivityLog"
import type { EntityType } from "@/constants/entityTypes"
import { resolveTrackedFields } from "@/lib/activity-log/fieldResolution"
import { toAuditPlain, valuesEqual } from "@/lib/activity-log/normalize"
import { ACTION_DELETE } from "@/lib/activity-log/logEntityChanges"

/**
 * Activity log rows for a bulk change.
 *
 * The audit plugin hooks `save` and the audited helpers hook one
 * findByIdAndUpdate at a time. `updateMany` reaches neither. So a bulk route
 * reads the rows before and after, and this writes the same per-field rows
 * the plugin would, in one insert.
 *
 * Audit failures are logged, never thrown. The change itself already
 * happened, the same rule as src/lib/activity-log.
 */
export async function logBulkChanges(
    model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    entityType: EntityType,
    befores: Array<Record<string, unknown>>,
    afters: Array<Record<string, unknown>>,
    actorId: string
): Promise<void> {
    const fields = resolveTrackedFields(model.schema, entityType)
    const afterById = new Map(afters.map((a) => [String(a._id), a]))
    const userId = new Types.ObjectId(actorId)

    const ops: Array<Record<string, unknown>> = []

    for (const rawBefore of befores) {
        const id = String(rawBefore._id)
        const rawAfter = afterById.get(id)
        if (!rawAfter) continue

        const before = toAuditPlain(rawBefore) ?? {}
        const after = toAuditPlain(rawAfter) ?? {}

        for (const field of fields) {
            if (!valuesEqual(before[field], after[field])) {
                ops.push({
                    entityType,
                    entityId: new Types.ObjectId(id),
                    action: field,
                    oldData: before[field] ?? null,
                    newData: after[field] ?? null,
                    userId,
                })
            }
        }
    }

    await insertLogs(ops)
}

/** One DELETE row per id, the same marker logEntityChanges writes. */
export async function logBulkDeletes(
    entityType: EntityType,
    ids: Types.ObjectId[],
    actorId: string
): Promise<void> {
    const userId = new Types.ObjectId(actorId)
    await insertLogs(
        ids.map((id) => ({
            entityType,
            entityId: id,
            action: ACTION_DELETE,
            oldData: id.toString(),
            newData: null,
            userId,
        }))
    )
}

async function insertLogs(ops: Array<Record<string, unknown>>): Promise<void> {
    if (ops.length === 0) return
    try {
        await ActivityLog.insertMany(ops)
    } catch (error) {
        console.error("[lead-sources] activity log insert failed:", error)
    }
}
