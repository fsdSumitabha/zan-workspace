import User from "@/models/User"
import { NOTIFICATION_RULES } from "@/constants/notificationRules"
import type { EventType } from "@/constants/eventTypes"

interface ResolveInput {
    type: EventType
    actorId: string | null
    extraRecipients?: string[]
}

export async function resolveRecipients({ type, actorId, extraRecipients }: ResolveInput): Promise<string[]> {
    const roles = NOTIFICATION_RULES[type] ?? []
    const set = new Set<string>()

    if (roles.length > 0) {
        const docs = await User.find({ role: { $in: roles }, isActive: true })
            .select("_id")
            .lean<{ _id: { toString(): string } }[]>()
        for (const d of docs) set.add(String(d._id))
    }

    for (const id of extraRecipients ?? []) {
        if (id) set.add(String(id))
    }

    if (actorId) set.delete(String(actorId))

    return [...set]
}
