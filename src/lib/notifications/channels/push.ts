import { badgeIconUrl } from "../iconUrl"
import type { DispatchContext } from "../../../types/notification"

export async function dispatchPush(ctx: DispatchContext): Promise<void> {
    const payload = {
        title: ctx.message.title,
        body: ctx.message.body,
        icon: badgeIconUrl(ctx.message.badge),
        data: { url: ctx.message.url },
    }
    console.log(`[notifications] push channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`, payload.title)
}
