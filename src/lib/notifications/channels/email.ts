import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import type { DispatchContext } from "../../../types/notification"

const LABEL = NOTIFICATION_CHANNEL[2]

export async function dispatchEmail(ctx: DispatchContext): Promise<void> {
    console.log(`[notifications] ${LABEL} channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`)
}
