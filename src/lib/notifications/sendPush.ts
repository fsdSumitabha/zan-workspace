import type { Types } from "mongoose"
import PushDevice from "@/models/PushDevice"
import { adminMessaging } from "@/lib/firebase/admin"

export interface PushMessage {
    title: string
    body?: string
    url?: string
}

export interface PushResult {
    sent: number
    failed: number
}

// FCM takes at most 500 IDs per call.
const BATCH_SIZE = 500

// FCM returns these when a browser is gone for good. We delete its row.
// Not "invalid-argument": a bad payload also returns it, and would wipe every row.
const DEAD_DEVICE_CODES = [
    "messaging/installation-id-not-registered",
    "messaging/registration-token-not-registered",
]

/**
 * Sends one message to every browser of the given users.
 *
 * It sends data only (title, body, url). The service worker at
 * /firebase-messaging-sw.js turns it into a system notification. If a CRM tab
 * is open on screen, Firebase passes it to that tab instead (see PushListener).
 */
export async function sendPush(userIds: Types.ObjectId[], message: PushMessage): Promise<PushResult> {
    const devices = await PushDevice.find({ user: { $in: userIds } })
        .select("fid")
        .lean<{ fid: string }[]>()

    if (devices.length === 0) return { sent: 0, failed: 0 }

    // FCM data values must be strings, so empty fields are left out.
    const data: Record<string, string> = { title: message.title }
    if (message.body) data.body = message.body
    if (message.url) data.url = message.url

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
                headers: { Urgency: "high", TTL: String(60 * 60 * 24) },
            },
        })

        sent += res.successCount
        res.responses.forEach((r, idx) => {
            if (!r.error) return
            if (DEAD_DEVICE_CODES.includes(r.error.code)) dead.push(batch[idx])
            else console.error(`[notifications] push to one browser failed: ${r.error.code}`)
        })
    }

    if (dead.length > 0) {
        await PushDevice.deleteMany({ fid: { $in: dead } })
    }

    return { sent, failed: fids.length - sent }
}
