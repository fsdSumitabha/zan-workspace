"use client"

import { useSyncExternalStore } from "react"
import { DEFAULT_TIME_ZONE, getBrowserTimeZone } from "@/lib/time/zone"

// The zone does not change while a page is open, so there is nothing to
// subscribe to.
const subscribe = () => () => {}

/**
 * The time zone of this browser, such as "Asia/Dubai". Every time on screen
 * is written in it.
 *
 * While the server renders the page it is India's zone, and React switches
 * to the browser's zone after hydration without a mismatch warning. Meeting
 * data loads in the browser anyway, so the server value is rarely seen.
 */
export function useViewerZone(): string {
    return useSyncExternalStore(subscribe, getBrowserTimeZone, () => DEFAULT_TIME_ZONE)
}
