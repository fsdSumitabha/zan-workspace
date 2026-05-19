import mongoose from "mongoose"

import { ensureAuditPlugin } from "./ensureAuditPlugin"
import type { EntityType } from "./types"

const MODEL_ENTITY_MAP: Array<{ modelName: string; entityType: EntityType }> = [
    { modelName: "User", entityType: "USER" },
    { modelName: "Lead", entityType: "LEAD" },
    { modelName: "Client", entityType: "CLIENT" },
    { modelName: "Project", entityType: "PROJECT" },
    { modelName: "Interaction", entityType: "INTERACTION" },
    { modelName: "Call", entityType: "CALL" },
    { modelName: "Meeting", entityType: "MEETING" },
    { modelName: "Document", entityType: "DOCUMENT" },
    { modelName: "Quotation", entityType: "QUOTATION" },
]

/** Ensure audit hooks exist on compiled models (fixes Next.js hot-reload). */
export function registerAuditPluginsOnModels(): void {
    for (const { modelName, entityType } of MODEL_ENTITY_MAP) {
        const model = mongoose.models[modelName]
        if (model) {
            ensureAuditPlugin(model.schema, entityType)
        }
    }
}
