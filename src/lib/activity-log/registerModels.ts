import mongoose from "mongoose"

import { ensureAuditPlugin } from "./ensureAuditPlugin"
import { EntityType } from "@/constants/entityTypes"

const MODEL_ENTITY_MAP: Array<{ modelName: string; entityType: EntityType }> = [
    { modelName: "User", entityType: 4 },
    { modelName: "Lead", entityType: 0 },
    { modelName: "Client", entityType: 1 },
    { modelName: "Project", entityType: 2 },
    { modelName: "Interaction", entityType: 3 },
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
