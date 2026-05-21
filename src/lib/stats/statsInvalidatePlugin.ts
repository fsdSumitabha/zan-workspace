import type { Schema } from "mongoose"

import { invalidateStatsSnapshot } from "./invalidateStats"

const appliedSchemas = new WeakSet<Schema>()

/**
 * Mongoose plugin that bumps the dashboard-stats cache whenever a
 * tracked entity is written. Fire-and-forget; never blocks the write.
 *
 * Hooked operations:
 *   - `save`              — creates and document-level updates
 *   - `findOneAndUpdate`  — covers `findByIdAndUpdate`, including the
 *                            soft-delete path that sets `deletedAt`
 *
 * Hard `deleteOne` / `findOneAndDelete` aren't used by the app today
 * (soft delete is the convention), so they're not hooked. Add them
 * if that ever changes.
 *
 * Idempotent: re-applying to the same schema is a no-op. Important
 * because Next.js hot reload can re-run model files.
 */
export function statsInvalidatePlugin(schema: Schema): void {
    if (appliedSchemas.has(schema)) return
    appliedSchemas.add(schema)

    // Awaited (not fire-and-forget) so the write response doesn't return
    // until the snapshot is actually gone. Without this, an immediate
    // dashboard refresh after a create/delete can race and still see
    // the cached count.
    const fire = async () => {
        try {
            console.log("[stats] invalidating after write")
            await invalidateStatsSnapshot()
        } catch (err) {
            console.error("[stats] invalidate failed:", err)
        }
    }

    schema.post("save", fire)
    schema.post("findOneAndUpdate", fire)
}
