import type { Types } from "mongoose"
import type { EventType } from "@/constants/eventTypes"

export interface NotificationActor {
    id: string
    name?: string
    role?: number
}

export interface RenderedMessage {
    title: string
    body?: string
    url?: string
}

export interface EmitInput {
    type: EventType
    entityType: number
    entityId: string | Types.ObjectId
    actor: NotificationActor | null
    payload: Record<string, unknown>
    meta?: Record<string, unknown>
    channels?: number[]
    extraRecipients?: string[]
}
