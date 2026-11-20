"use client"

import { useEffect } from "react"

/**
 * Warns before the tab closes while there is unsaved work.
 *
 * ## What this covers and what it does not
 *
 * `beforeunload` catches closing the tab, reloading, and typing a new
 * address. It does NOT catch an in-app navigation, because Next's client
 * router never unloads the page. The editor handles that case itself by
 * confirming before it calls `router.push`.
 *
 * Browsers ignore any custom message and show their own wording, so there
 * is nothing to pass in. The only thing that matters is whether the
 * handler calls `preventDefault`.
 *
 * The listener is removed as soon as the work is saved. A page that always
 * asks "are you sure?" trains people to click through it.
 */
export function useUnsavedGuard(dirty: boolean): void {
    useEffect(() => {
        if (!dirty) return

        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            // Older browsers need returnValue set to something.
            event.returnValue = ""
        }

        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [dirty])
}
