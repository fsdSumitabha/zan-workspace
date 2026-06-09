import { NOTIFICATION_CHANNEL, type NotificationChannel } from "@/constants/notificationChannels"
import { dispatchInApp } from "./channels/inApp"
import { dispatchEmail } from "./channels/email"
import { dispatchPush } from "./channels/push"
import { dispatchSms } from "./channels/sms"
import type { DispatchContext } from "../../types/notification"

const ROUTES: Array<[NotificationChannel, (ctx: DispatchContext) => Promise<void>]> = [
    [1, dispatchInApp],
    [2, dispatchEmail],
    [3, dispatchSms],
    [4, dispatchPush],
]

export async function dispatchNotification(ctx: DispatchContext): Promise<void> {
    const active = ROUTES.filter(([code]) => ctx.channels.includes(code))
    if (active.length === 0) return

    const results = await Promise.allSettled(active.map(([, run]) => run(ctx)))
    results.forEach((r, i) => {
        if (r.status === "rejected") {
            console.error(`[notifications] channel="${NOTIFICATION_CHANNEL[active[i][0]]}" failed:`, r.reason)
        }
    })
}
