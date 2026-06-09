import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import { dispatchInApp } from "./channels/inApp"
import { dispatchEmail } from "./channels/email"
import { dispatchPush } from "./channels/push"
import { dispatchSms } from "./channels/sms"
import type { DispatchContext } from "./types"

export async function dispatchNotification(ctx: DispatchContext): Promise<void> {
    const tasks: { name: string; run: () => Promise<void> }[] = []

    if (ctx.channels.includes(NOTIFICATION_CHANNEL.IN_APP)) tasks.push({ name: "in-app", run: () => dispatchInApp(ctx) })
    if (ctx.channels.includes(NOTIFICATION_CHANNEL.EMAIL))  tasks.push({ name: "email",  run: () => dispatchEmail(ctx) })
    if (ctx.channels.includes(NOTIFICATION_CHANNEL.PUSH))   tasks.push({ name: "push",   run: () => dispatchPush(ctx) })
    if (ctx.channels.includes(NOTIFICATION_CHANNEL.SMS))    tasks.push({ name: "sms",    run: () => dispatchSms(ctx) })

    const results = await Promise.allSettled(tasks.map((t) => t.run()))
    results.forEach((r, i) => {
        if (r.status === "rejected") {
            console.error(`[notifications] channel="${tasks[i].name}" failed:`, r.reason)
        }
    })
}
