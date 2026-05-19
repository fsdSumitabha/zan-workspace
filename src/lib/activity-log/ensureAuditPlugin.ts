import type { Schema } from "mongoose"

import { auditPlugin } from "./mongooseAuditMiddleware"
import type { EntityType } from "./types"

const appliedSchemas = new WeakSet<Schema>()

/**
 * Next.js hot-reload can reuse mongoose.models.* compiled before the plugin
 * was added. Always call this on the schema that backs the live model.
 */
export function ensureAuditPlugin(
    schema: Schema,
    entityType: EntityType
): void {
    if (appliedSchemas.has(schema)) return

    schema.plugin(auditPlugin, { entityType })
    appliedSchemas.add(schema)
}
