import { InteractionType } from "@/config/interactionTypes"

export interface Interaction {
    _id?: string;
    type: InteractionType
    title: string
    subtitle?: string
    time: string
    user: string
}