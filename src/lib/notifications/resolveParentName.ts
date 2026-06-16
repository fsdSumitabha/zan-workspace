import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export async function resolveParentName(entityType: number, entityId: string | undefined): Promise<string | undefined> {
    if (!entityId) return undefined
    try {
        if (entityType === ENTITY_TYPE.LEAD) {
            const doc = await Lead.findById(entityId).select("name").lean<{ name?: string }>()
            return doc?.name
        }
        if (entityType === ENTITY_TYPE.CLIENT) {
            const doc = await Client.findById(entityId).select("name company").lean<{ name?: string; company?: string }>()
            if (!doc) return undefined
            return doc.company ? `${doc.name} (${doc.company})` : doc.name
        }
        if (entityType === ENTITY_TYPE.PROJECT) {
            const doc = await Project.findById(entityId).select("title").lean<{ title?: string }>()
            return doc?.title
        }
    } catch {
        return undefined
    }
    return undefined
}
