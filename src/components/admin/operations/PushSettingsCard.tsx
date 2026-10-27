"use client"

import { useEffect, useState } from "react"
import { BellOff, BellRing, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { disablePush, enablePush, getPushStatus, type PushStatus } from "@/lib/notifications/pushClient"

// "Send test" waits this long, so there is time to switch tabs and see a system notification.
const TEST_DELAY_MS = 5_000

const STATUS_TEXT: Record<PushStatus, string> = {
    on: "On for this browser. Alerts arrive even when the CRM is closed.",
    off: "Get alerts on this device, even when the CRM is closed.",
    blocked: "Blocked in this browser. Allow notifications for this site in your browser settings, then reload the page.",
    unsupported: "This browser cannot show push notifications. On iPhone or iPad, add the app to your Home Screen first.",
}

const PRIMARY_BUTTON = "inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
const SECONDARY_BUTTON = "inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"

export default function PushSettingsCard() {
    const [status, setStatus] = useState<PushStatus | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        getPushStatus().then(setStatus).catch(() => setStatus("unsupported"))
    }, [])

    const turnOn = async () => {
        setBusy(true)
        try {
            await enablePush()
            toast.success("Push notifications are on for this browser")
        } catch (err) {
            console.error("[push] turn on failed:", err)
            toast.error(Notification.permission === "denied"
                ? "Notifications are blocked. Allow them in your browser settings."
                : "Could not turn on push notifications")
        } finally {
            setStatus(await getPushStatus())
            setBusy(false)
        }
    }

    const turnOff = async () => {
        setBusy(true)
        try {
            await disablePush()
            toast.success("Push notifications are off for this browser")
        } catch (err) {
            console.error("[push] turn off failed:", err)
            toast.error("Could not turn off push notifications")
        } finally {
            setStatus(await getPushStatus())
            setBusy(false)
        }
    }

    const sendTest = async () => {
        setBusy(true)
        toast.info("Test coming in 5 seconds. Switch to another tab to see it as a system notification.")
        await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS))
        try {
            const res = await fetch("/api/notifications/devices/test", { method: "POST", credentials: "include" })
            const json = await res.json()
            if (!json.success) throw new Error(json.message)
            if (json.sent === 0) {
                toast.error("No browser is saved for you yet. Turn push off, then on again.", { duration: 10_000 })
            }
        } catch (err) {
            console.error("[push] test failed:", err)
            toast.error("Test push failed. Check the server log.", { duration: 10_000 })
        } finally {
            setBusy(false)
        }
    }

    if (!status) return null

    return (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 sm:px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5 min-w-0">
                {status === "on"
                    ? <BellRing className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                    : <BellOff className="w-4 h-4 mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400" />}
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white">Push notifications</div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{STATUS_TEXT[status]}</p>
                </div>
            </div>

            {(status === "on" || status === "off") && (
                <div className="flex items-center gap-2 shrink-0">
                    {busy && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
                    {status === "off" && (
                        <button type="button" onClick={turnOn} disabled={busy} className={PRIMARY_BUTTON}>
                            Turn on
                        </button>
                    )}
                    {status === "on" && (
                        <>
                            <button type="button" onClick={sendTest} disabled={busy} className={PRIMARY_BUTTON}>
                                Send test
                            </button>
                            <button type="button" onClick={turnOff} disabled={busy} className={SECONDARY_BUTTON}>
                                Turn off
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
