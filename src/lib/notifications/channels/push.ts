import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import { PUSH_CHANNEL, PUSH_CHANNEL_BY_EVENT } from "@/constants/pushChannels"
import { sendPush } from "../sendPush"
import type { DispatchContext } from "../../../types/notification"

export async function dispatchPush(ctx: DispatchContext): Promise<void> {
    const label = NOTIFICATION_CHANNEL[4].label
    const { title, body, url } = ctx.message
    const { sent, failed } = await sendPush(ctx.recipients, {
        title,
        body,
        url,
        channel: PUSH_CHANNEL_BY_EVENT[ctx.type] ?? PUSH_CHANNEL.GENERAL,
        type: ctx.type,
        entityType: ctx.entityType,
        entityId: String(ctx.entityId),
    })
    console.log(`[notifications] ${label} type=${ctx.type} sent=${sent} failed=${failed}`)
}
