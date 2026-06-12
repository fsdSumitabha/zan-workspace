import Notification from "@/models/Notification"
import type { DispatchContext } from "../../types/notification"

export async function commitNotification(ctx: DispatchContext): Promise<void> {
    const { title, body, url, badge, imageUrl } = ctx.message

    const docs = ctx.recipients.map((recipient) => ({
        recipient,
        type: ctx.type,
        actor: ctx.actorOid,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        title,
        body,
        url,
        badge,
        imageUrl,
        channels: ctx.channels,
        meta: ctx.meta,
    }))

    await Notification.insertMany(docs, { ordered: false })
}
