import {
    getMessaging, isSupported, onMessage, onRegistered, register, unregister,
    type MessagePayload, type Messaging,
} from "firebase/messaging"
import { getFirebaseApp, vapidKey } from "@/lib/firebase/firebase"

// The browser side of push notifications. Import it only in client components.

export type PushStatus = "unsupported" | "blocked" | "off" | "on"

// Set when the user turns push off on this browser, so the next visit does not turn it back on.
const OFF_KEY = "push-notifications-off"

let messaging: Messaging | null = null
let saving: Promise<void> = Promise.resolve()

function getPushMessaging(): Messaging {
    if (messaging) return messaging
    messaging = getMessaging(getFirebaseApp())

    // Firebase calls this after each register(), with this browser's
    // Firebase Installation ID (FID). It also calls it by itself if the ID
    // ever changes. Either way, we save the ID on our server.
    onRegistered(messaging, (fid) => {
        saving = saveDevice(fid)
        saving.catch((err) => console.error("[push] saving this browser failed:", err))
    })
    return messaging
}

async function saveDevice(fid: string): Promise<void> {
    const res = await fetch("/api/notifications/devices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid }),
    })
    if (!res.ok) throw new Error("Failed to save this browser for push notifications")
}

export async function getPushStatus(): Promise<PushStatus> {
    if (!(await isSupported())) return "unsupported"
    if (Notification.permission === "denied") return "blocked"
    if (Notification.permission === "granted" && localStorage.getItem(OFF_KEY) !== "1") return "on"
    return "off"
}

// Asks for permission if needed, then registers this browser. Call it from a click:
// browsers only show the permission prompt after a user action.
export async function enablePush(): Promise<void> {
    localStorage.removeItem(OFF_KEY)
    await register(getPushMessaging(), { vapidKey })
    await saving
}

// Runs on every visit. It registers again only when push is already on,
// so it never shows the permission prompt.
export async function syncPush(): Promise<void> {
    if ((await getPushStatus()) !== "on") return
    await register(getPushMessaging(), { vapidKey })
    await saving
}

export async function disablePush(): Promise<void> {
    localStorage.setItem(OFF_KEY, "1")
    await fetch("/api/notifications/devices", { method: "DELETE", credentials: "include" })
    // Tell FCM too. If this fails, our server has already stopped sending here.
    await unregister(getPushMessaging()).catch(() => {})
}

// Messages that arrive while a CRM tab is open on screen.
export function onPushMessage(handler: (payload: MessagePayload) => void): () => void {
    return onMessage(getPushMessaging(), handler)
}
