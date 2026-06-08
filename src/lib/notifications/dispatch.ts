import mongoose from "mongoose"
import Notification from "@/models/Notification"
import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import { resolveRecipients } from "./resolveRecipients"
import { renderMessage } from "./render"
import type { EmitInput } from "./types"

const MAX_RECIPIENTS = 500

export async function notifyEvent(input: EmitInput): Promise<void> {
    try {
        const recipients = await resolveRecipients({
            type: input.type,
            actorId: input.actor?.id ?? null,
            extraRecipients: input.extraRecipients,
        })

        console.log(`[notifications] type=${input.type} actor=${input.actor?.id ?? "system"} recipients=${recipients.length}`)

        if (recipients.length === 0) return

        if (recipients.length > MAX_RECIPIENTS) {
            console.warn(`[notifications] type=${input.type} resolved ${recipients.length} recipients; truncating to ${MAX_RECIPIENTS}`)
        }

        const { title, body, url } = renderMessage(input.type, input.payload, input.actor)

        const actorOid = input.actor?.id ? new mongoose.Types.ObjectId(input.actor.id) : null
        const entityOid = typeof input.entityId === "string"
            ? new mongoose.Types.ObjectId(input.entityId)
            : input.entityId

        const docs = recipients.slice(0, MAX_RECIPIENTS).map((id) => ({
            recipient: new mongoose.Types.ObjectId(id),
            type: input.type,
            actor: actorOid,
            entityType: input.entityType,
            entityId: entityOid,
            title,
            body,
            url,
            channels: input.channels ?? [NOTIFICATION_CHANNEL.IN_APP],
            meta: input.meta,
        }))

        await Notification.insertMany(docs, { ordered: false })
    } catch (err) {
        console.error("[notifications] notifyEvent failed:", err)
    }
}
