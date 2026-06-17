import { ENTITY_TYPE, ENTITY_TYPE_META } from "@/constants/entityTypes"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"


export async function resolveEntityEmail(
    entityType: number,
    entityId: string
): Promise<string | null> {
    switch (entityType) {
        case ENTITY_TYPE.LEAD: {
            const lead = await Lead.findById(entityId).select("email").lean()
            return lead?.email ?? null
        }
        case ENTITY_TYPE.CLIENT: {
            const client = await Client.findById(entityId).select("email").lean()
            return client?.email ?? null
        }
        case ENTITY_TYPE.PROJECT: {
            const project = await Project.findById(entityId)
                .select("clientId")
                .lean()
            if (!project?.clientId) return null
            const client = await Client.findById(project.clientId)
                .select("email")
                .lean()
            return client?.email ?? null
        }
        default:
            return null
    }
}