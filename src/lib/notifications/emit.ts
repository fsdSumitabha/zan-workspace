import mongoose from "mongoose"
import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import { resolveRecipients } from "./resolveRecipients"
import { renderMessage } from "./render"
import { dispatchNotification } from "./dispatch"
import type { EmitInput, DispatchContext } from "./types"

const MAX_RECIPIENTS = 500

export async function emitNotification(input: EmitInput): Promise<void> {
    try {
        const recipientIds = await resolveRecipients({
            type: input.type,
            actorId: input.actor?.id ?? null,
            extraRecipients: input.extraRecipients,
        })

        console.log(`[notifications] type=${input.type} actor=${input.actor?.id ?? "system"} recipients=${recipientIds.length}`)

        if (recipientIds.length === 0) return

        if (recipientIds.length > MAX_RECIPIENTS) {
            console.warn(`[notifications] type=${input.type} resolved ${recipientIds.length} recipients; truncating to ${MAX_RECIPIENTS}`)
        }

        const message = renderMessage(input.type, input.payload as Record<string, any>, input.actor)

        const entityOid = typeof input.entityId === "string"
            ? new mongoose.Types.ObjectId(input.entityId)
            : input.entityId
        const actorOid = input.actor?.id ? new mongoose.Types.ObjectId(input.actor.id) : null
        const recipients = recipientIds.slice(0, MAX_RECIPIENTS).map((id) => new mongoose.Types.ObjectId(id))

        const ctx: DispatchContext = {
            type: input.type,
            entityType: input.entityType,
            entityId: entityOid,
            actor: input.actor,
            actorOid,
            recipients,
            message,
            channels: input.channels ?? [NOTIFICATION_CHANNEL.IN_APP],
            meta: input.meta,
        }

        await dispatchNotification(ctx)
    } catch (err) {
        console.error("[notifications] emit failed:", err)
    }
}
