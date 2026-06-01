import mongoose from "mongoose"

import { ensureAuditPlugin } from "./ensureAuditPlugin"
import { ENTITY_TYPE, EntityType } from "@/constants/entityTypes"

const MODEL_ENTITY_MAP: Array<{ modelName: string; entityType: EntityType }> = [
    { modelName: "User", entityType: ENTITY_TYPE.USER },
    { modelName: "Lead", entityType: ENTITY_TYPE.LEAD },
    { modelName: "Client", entityType: ENTITY_TYPE.CLIENT },
    { modelName: "Project", entityType: ENTITY_TYPE.PROJECT },
    { modelName: "Interaction", entityType: ENTITY_TYPE.INTERACTION },
    { modelName: "Meeting", entityType: ENTITY_TYPE.MEETING },
    { modelName: "Document", entityType: ENTITY_TYPE.DOCUMENT },
    { modelName: "Call", entityType: ENTITY_TYPE.CALL },
    { modelName: "Quotation", entityType: ENTITY_TYPE.QUOTATION },
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
