import { InteractionType } from "@/constants/interactionTypes"
import { EntityType } from "@/constants/entityTypes"

export interface Interaction {
    _id: string

    entityType: EntityType
    entityId: string

    type: InteractionType

    title?: string
    description?: string

    refId?: string

    createdBy?: string

    createdAt: string
    updatedAt: string
}