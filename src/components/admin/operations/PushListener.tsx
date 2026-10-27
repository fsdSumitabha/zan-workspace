"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getPushStatus, onPushMessage, syncPush } from "@/lib/notifications/pushClient"
import { NOTIFICATIONS_REFRESH_EVENT } from "./NotificationBell"

/**
 * Mounted once, in the operations layout. It renders nothing.
 * - On each visit, it registers this browser again if push is on.
 * - When a push arrives while the CRM is open on screen, it shows a toast
 *   and refreshes the bell.
 * - When the user clicks a system notification, it opens that page here.
 */
export default function PushListener() {
    const router = useRouter()

    useEffect(() => {
        let cancelled = false
        let stopMessages: (() => void) | undefined

        getPushStatus()
            .then((status) => {
                if (cancelled || status === "unsupported") return

                stopMessages = onPushMessage((payload) => {
                    const { title, body, url } = payload.data ?? {}
                    toast(title || "New notification", {
                        description: body,
                        action: url ? { label: "Open", onClick: () => router.push(url) } : undefined,
                    })
                    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT))
                })

                if (status === "on") {
                    syncPush().catch((err) => console.error("[push] sync failed:", err))
                }
            })
            .catch((err) => console.error("[push] setup failed:", err))

        // The service worker sends this when the user clicks a system notification.
        const onWorkerMessage = (e: MessageEvent) => {
            const url = e.data?.type === "open-url" ? e.data.url : null
            if (typeof url === "string" && url.startsWith("/")) router.push(url)
        }
        navigator.serviceWorker?.addEventListener("message", onWorkerMessage)

        return () => {
            cancelled = true
            stopMessages?.()
            navigator.serviceWorker?.removeEventListener("message", onWorkerMessage)
        }
    }, [router])

    return null
}
