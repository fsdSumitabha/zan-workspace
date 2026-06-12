import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import type { DispatchContext } from "../../../types/notification"

export async function dispatchSms(ctx: DispatchContext): Promise<void> {
    const label = NOTIFICATION_CHANNEL[3].label
    console.log(`[notifications] ${label} channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`)
}
