import mongoose from "mongoose"

import { statsInvalidatePlugin } from "./statsInvalidatePlugin"

/**
 * Models whose writes affect the dashboard counters. Adding a new
 * entity here is all it takes to wire it into stats invalidation.
 */
const TRACKED_MODELS = ["Lead", "Client", "Project", "Meeting"] as const

/**
 * Attaches the stats-invalidate plugin to each tracked model's schema.
 * Mirrors `registerAuditPluginsOnModels` so Next.js hot-reload keeps
 * hooks attached after a model module is re-evaluated.
 */
export function registerStatsInvalidatorOnModels(): void {
    for (const name of TRACKED_MODELS) {
        const model = mongoose.models[name]
        if (model) {
            statsInvalidatePlugin(model.schema)
        }
    }
}
