import type { Types } from "mongoose"
import type { ApnsConfig, Aps } from "firebase-admin/messaging"
import PushDevice from "@/models/PushDevice"
import { adminMessaging } from "@/lib/firebase/admin"
import { PUSH_CHANNEL_META, PUSH_LEVEL, type PushChannel } from "@/constants/pushChannels"
import type { EventType } from "@/constants/eventTypes"

export interface PushMessage {
    title: string
    body?: string
    url?: string
    channel: PushChannel
    type?: EventType            // the event behind it. A test push has none.
    entityType?: number         // ENTITY_TYPE code of the record the event is about
    entityId?: string
    imageUrl?: string           // a picture for the notification, e.g. a person's avatar. Most have none.
}

export interface PushResult {
    sent: number
    failed: number
}

// FCM takes at most 500 IDs per call.
const BATCH_SIZE = 500

// A push the device has not received within a day is dropped.
const TTL_SECONDS = 60 * 60 * 24

// FCM returns these when a device is gone for good. We delete its row.
// Not "invalid-argument": a bad payload also returns it, and would wipe every row.
const DEAD_DEVICE_CODES = [
    "messaging/installation-id-not-registered",
    "messaging/registration-token-not-registered",
]

/**
 * Sends one message to every browser and phone of the given users.
 *
 * It sends data only: title, body and url, plus channel, type, entityType,
 * entityId and imageUrl for the phone app. Each platform shows it in its own way:
 * - Browser: the service worker at /firebase-messaging-sw.js turns it into a
 *   system notification. If a CRM tab is open on screen, Firebase passes it to
 *   that tab instead (see PushListener). The worker uses channel and entityId
 *   to replace an older notification about the same record. It ignores the rest.
 * - Android: the app shows it on the Android channel for `channel`.
 * - iOS: iOS shows the `apns` alert itself (see getApnsConfig).
 */
export async function sendPush(userIds: Types.ObjectId[], message: PushMessage): Promise<PushResult> {
    const devices = await PushDevice.find({ user: { $in: userIds } })
        .select("fid")
        .lean<{ fid: string }[]>()

    if (devices.length === 0) return { sent: 0, failed: 0 }

    // FCM data values must be strings, so empty fields are left out.
    const data: Record<string, string> = { title: message.title, channel: String(message.channel) }
    if (message.body) data.body = message.body
    if (message.url) data.url = message.url
    if (message.type !== undefined) data.type = String(message.type)
    if (message.entityType !== undefined) data.entityType = String(message.entityType)
    if (message.entityId) data.entityId = message.entityId
    if (message.imageUrl) data.imageUrl = message.imageUrl

    const apns = getApnsConfig(message)
    const fids = devices.map((d) => d.fid)
    const dead: string[] = []
    let sent = 0

    for (let i = 0; i < fids.length; i += BATCH_SIZE) {
        const batch = fids.slice(i, i + BATCH_SIZE)
        const res = await adminMessaging().sendEachForMulticast({
            fids: batch,
            data,
            webpush: {
                // "high" wakes a sleeping phone. TTL drops the alert if the browser stays offline for a day.
                headers: { Urgency: "high", TTL: String(TTL_SECONDS) },
            },
            android: {
                // Without "high", Android holds a data-only message until the
                // app is opened. FCM lowers the priority of apps that send
                // "high" and then show nothing, so send it only for pushes
                // that always show a notification. Every push does today.
                priority: "high",
                ttl: TTL_SECONDS * 1000,
            },
            apns,
        })

        sent += res.successCount
        res.responses.forEach((r, idx) => {
            if (!r.error) return
            if (DEAD_DEVICE_CODES.includes(r.error.code)) dead.push(batch[idx])
            else console.error(`[notifications] push to one device failed: ${r.error.code}`)
        })
    }

    if (dead.length > 0) {
        await PushDevice.deleteMany({ fid: { $in: dead } })
    }

    return { sent, failed: fids.length - sent }
}

/**
 * The iOS part of the message. iOS shows the alert itself, even when the app
 * is closed. iOS has no channels, so the channel decides three things here:
 * - thread-id groups the alerts, one group per channel.
 * - category picks the action buttons, once the iOS app defines them.
 * - A SILENT channel arrives without sound and without lighting the screen.
 *
 * Browsers and Android ignore this part. "time-sensitive" is left out: it
 * needs an entitlement from Apple, and no server push is urgent yet.
 */
function getApnsConfig(message: PushMessage): ApnsConfig {
    const meta = PUSH_CHANNEL_META[message.channel]
    const isSilent = meta.level === PUSH_LEVEL.SILENT

    const aps: Aps = {
        alert: message.body ? { title: message.title, body: message.body } : { title: message.title },
        threadId: meta.id,
        category: meta.id,
        "interruption-level": isSilent ? "passive" : "active",
    }
    if (!isSilent) aps.sound = "default"

    return {
        headers: {
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": String(Math.floor(Date.now() / 1000) + TTL_SECONDS),
            // One notification per record: a new update replaces the last one.
            ...(message.entityId ? { "apns-collapse-id": `${meta.id}-${message.entityId}` } : {}),
        },
        payload: { aps },
    }
}
