import type { DispatchContext } from "../../../types/notification"

export async function dispatchSms(ctx: DispatchContext): Promise<void> {
    console.log(`[notifications] sms channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`)
}
