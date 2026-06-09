import { NOTIFICATION_CHANNEL, type NotificationChannel } from "@/constants/notificationChannels"
import { commitNotification } from "./commitNotification"
import type { DispatchContext } from "../../types/notification"

const OPTIONAL_CODES = [2, 3, 4] as const satisfies readonly NotificationChannel[]

export async function dispatchNotification(ctx: DispatchContext): Promise<void> {
    try {
        await commitNotification(ctx)
    } catch (err) {
        console.error(`[notifications] In-App persist failed:`, err)
        return
    }

    const active = OPTIONAL_CODES.filter((c) => ctx.channels.includes(c))
    if (active.length === 0) return

    const results = await Promise.allSettled(active.map((c) => NOTIFICATION_CHANNEL[c].channel(ctx)))
    results.forEach((r, i) => {
        if (r.status === "rejected") {
            console.error(`[notifications] channel="${NOTIFICATION_CHANNEL[active[i]].label}" failed:`, r.reason)
        }
    })
}
