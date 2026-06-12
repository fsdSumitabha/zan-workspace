import type { Types } from "mongoose"
import type { EventType } from "@/constants/eventTypes"
import { NotificationChannel } from "@/constants/notificationChannels"

export interface NotificationActor {
    id: string
    name?: string
    role?: number
}

export interface RenderedMessage {
    title: string
    body?: string
    url?: string
    badge: string
    imageUrl?: string
}

export interface EmitInput {
    type: EventType
    entityType: number
    entityId: string | Types.ObjectId
    actor: NotificationActor | null
    payload: Record<string, unknown>
    meta?: Record<string, unknown>
    channels?: NotificationChannel[]
    extraRecipients?: string[]
}

export interface DispatchContext {
    type: EventType
    entityType: number
    entityId: Types.ObjectId
    actor: NotificationActor | null
    actorOid: Types.ObjectId | null
    recipients: Types.ObjectId[]
    message: RenderedMessage
    channels: number[]
    meta?: Record<string, unknown>
}
