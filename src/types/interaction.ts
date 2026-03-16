import { InteractionType } from "@/config/interactionTypes"

export interface Interaction {
    type: InteractionType
    title: string
    subtitle?: string
    time: string
    user: string
}