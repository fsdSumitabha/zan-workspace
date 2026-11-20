"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type AutosaveState = "idle" | "saving" | "saved" | "error"

/**
 * Saves the editor's draft on a timer while somebody is working.
 *
 * ## A draft is not a version
 *
 * This writes `draftMjml`, which is never compiled and never sent. The
 * server deliberately does not validate it, because autosave must not fail
 * and must not interrupt typing: half-finished MJML is exactly what a
 * draft is for. Validation happens on the explicit Save, which is the
 * moment the content could reach a real person.
 *
 * ## Why it does not save on every keystroke
 *
 * GrapesJS fires a change event for each drag, each character and each
 * style tweak. A request per event would be hundreds a minute. Instead the
 * content is held in a ref and written at a fixed interval, and only when
 * it has actually changed since the last write.
 */
export interface AutosaveHandle {
    state: AutosaveState
    lastSavedAt: Date | null
    /** Writes the draft now, if it has changed. */
    saveNow: () => void
    /**
     * Treats the current content as already written.
     *
     * The editor calls this right after an explicit Save, so autosave does
     * not write the same bytes again as a draft and make a template look
     * unsaved one second after it was saved.
     */
    markSaved: () => void
}

export function useAutosave(options: {
    /** Returns the current MJML, or null when the editor is not ready. */
    getContent: () => string | null
    /** Writes the draft. Should resolve false on a handled failure. */
    save: (mjml: string) => Promise<boolean>
    /** Milliseconds between checks. 20s by default. */
    intervalMs?: number
    enabled: boolean
}): AutosaveHandle {
    const { getContent, save, intervalMs = 20_000, enabled } = options

    const [state, setState] = useState<AutosaveState>("idle")
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

    // The last content we successfully wrote. Kept in a ref so changing it
    // never re-renders the editor, which would rebuild the canvas.
    const lastWritten = useRef<string | null>(null)
    const inFlight = useRef(false)

    const run = useCallback(async () => {
        if (!enabled || inFlight.current) return

        const content = getContent()
        if (content === null || content === lastWritten.current) return

        inFlight.current = true
        setState("saving")

        try {
            const ok = await save(content)
            if (ok) {
                lastWritten.current = content
                setLastSavedAt(new Date())
                setState("saved")
            } else {
                setState("error")
            }
        } catch {
            setState("error")
        } finally {
            inFlight.current = false
        }
    }, [enabled, getContent, save])

    useEffect(() => {
        if (!enabled) return
        const id = setInterval(run, intervalMs)
        return () => clearInterval(id)
    }, [enabled, intervalMs, run])

    const markSaved = useCallback(() => {
        lastWritten.current = getContent()
        setState("idle")
    }, [getContent])

    return { state, lastSavedAt, saveNow: run, markSaved }
}
