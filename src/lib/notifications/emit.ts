import mongoose from "mongoose"
import User from "@/models/User"
import { EVENT_CODE } from "@/constants/eventTypes"
import { normalizeTimeZone, zoneForRegion } from "@/lib/time/zone"
import { resolveRecipients } from "./resolveRecipients"
import { renderMessage } from "./render"
import { dispatchNotification } from "./dispatch"
import type { EmitInput, DispatchContext, RenderedMessage } from "../../types/notification"
import type { NotificationChannel } from "@/constants/notificationChannels"

const MAX_RECIPIENTS = 500

// Used when the caller does not pass `channels`. In-App is always on (see dispatch.ts).
const DEFAULT_CHANNELS: NotificationChannel[] = [4]   // Push: browsers and the phone app

// These texts carry a clock time ("tomorrow at 1:30 PM IST"), so each reader
// gets the text in their own time zone. Every other text is the same for
// everyone and is rendered once. COMPLETED shows the outcome, not a time.
const TIMED_EVENTS = new Set<number>([
    EVENT_CODE.MEETING_SCHEDULED,
    EVENT_CODE.MEETING_RESCHEDULED,
    EVENT_CODE.MEETING_CANCELLED,
    EVENT_CODE.MEETING_MISSED,
])

interface Group {
    message: RenderedMessage
    recipients: mongoose.Types.ObjectId[]
}

/**
 * Each reader's time zone: the one their browser saved on their account,
 * else their region's when they hold one region. A reader with neither gets
 * undefined, and their text uses the client's zone.
 *
 * The query runs in the actor's region scope, like resolveRecipients. A
 * reader outside it is simply not found and gets the client's zone.
 */
async function readerZones(ids: mongoose.Types.ObjectId[]): Promise<Map<string, string | undefined>> {
    const rows = await User.find({ _id: { $in: ids } })
        .select("_id timeZone regions")
        .lean<{ _id: unknown; timeZone?: string; regions?: string[] }[]>()

    const zones = new Map<string, string | undefined>()
    for (const r of rows) {
        const zone =
            normalizeTimeZone(r.timeZone) ??
            (r.regions?.length === 1 ? zoneForRegion(r.regions[0]) : undefined)
        zones.set(String(r._id), zone)
    }
    return zones
}

/** The text for each group of readers. One group unless the text has a clock time. */
async function renderForReaders(
    input: EmitInput,
    recipients: mongoose.Types.ObjectId[]
): Promise<Group[]> {
    const payload = input.payload as Record<string, any>

    if (!TIMED_EVENTS.has(input.type)) {
        return [{ message: renderMessage(input.type, payload, input.actor), recipients }]
    }

    let zones = new Map<string, string | undefined>()
    try {
        zones = await readerZones(recipients)
    } catch (err) {
        // Not fatal. Everyone then reads the client's zone, as before.
        console.error("[notifications] reader zones lookup failed:", err)
    }

    const groups = new Map<string, Group>()
    for (const id of recipients) {
        const zone = zones.get(String(id))
        const key = zone ?? ""
        let group = groups.get(key)
        if (!group) {
            group = {
                message: renderMessage(input.type, payload, input.actor, { readerZone: zone }),
                recipients: [],
            }
            groups.set(key, group)
        }
        group.recipients.push(id)
    }
    return [...groups.values()]
}

export async function emitNotification(input: EmitInput): Promise<void> {
    try {
        const recipientIds = await resolveRecipients({
            type: input.type,
            actorId: input.actor?.id ?? null,
            extraRecipients: input.extraRecipients,
        })

        console.log(`[notifications] type=${input.type} actor=${input.actor?.id ?? "system"} recipients=${recipientIds.length}`)

        if (recipientIds.length === 0) return

        if (recipientIds.length > MAX_RECIPIENTS) {
            console.warn(`[notifications] type=${input.type} resolved ${recipientIds.length} recipients; truncating to ${MAX_RECIPIENTS}`)
        }

        const entityOid = typeof input.entityId === "string"
            ? new mongoose.Types.ObjectId(input.entityId)
            : input.entityId
        const actorOid = input.actor?.id ? new mongoose.Types.ObjectId(input.actor.id) : null
        const recipients = recipientIds.slice(0, MAX_RECIPIENTS).map((id) => new mongoose.Types.ObjectId(id))

        const groups = await renderForReaders(input, recipients)

        for (const group of groups) {
            const ctx: DispatchContext = {
                type: input.type,
                entityType: input.entityType,
                entityId: entityOid,
                actor: input.actor,
                actorOid,
                recipients: group.recipients,
                message: group.message,
                channels: input.channels ?? DEFAULT_CHANNELS,
                meta: input.meta,
            }

            await dispatchNotification(ctx)
        }
    } catch (err) {
        console.error("[notifications] emit failed:", err)
    }
}
