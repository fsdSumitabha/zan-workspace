import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import { badgeIconUrl } from "../iconUrl"
import type { DispatchContext } from "../../../types/notification"

export async function dispatchPush(ctx: DispatchContext): Promise<void> {
    const label = NOTIFICATION_CHANNEL[4].label
    const payload = {
        title: ctx.message.title,
        body: ctx.message.body,
        icon: badgeIconUrl(ctx.message.badge),
        data: { url: ctx.message.url },
    }
    console.log(`[notifications] ${label} channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`, payload.title)
}
