import { NOTIFICATION_CHANNEL } from "@/constants/notificationChannels"
import type { DispatchContext } from "../../../types/notification"

const LABEL = NOTIFICATION_CHANNEL[3]

export async function dispatchSms(ctx: DispatchContext): Promise<void> {
    console.log(`[notifications] ${LABEL} channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`)
}
