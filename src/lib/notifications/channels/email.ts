import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import type { DispatchContext } from "../../../types/notification"

export async function dispatchEmail(ctx: DispatchContext): Promise<void> {
    const label = NOTIFICATION_CHANNEL[2].label
    console.log(`[notifications] ${label} channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`)
}
