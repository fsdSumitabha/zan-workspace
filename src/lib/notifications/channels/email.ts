import type { DispatchContext } from "../types"

export async function dispatchEmail(ctx: DispatchContext): Promise<void> {
    console.log(`[notifications] email channel not implemented (type=${ctx.type}, recipients=${ctx.recipients.length})`)
}
