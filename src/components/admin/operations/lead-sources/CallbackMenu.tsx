"use client"

import { useEffect, useRef, useState } from "react"
import clsx from "clsx"
import { toast } from "sonner"
import { AlarmClock, AlarmClockPlus } from "lucide-react"
import type { LeadSourceRow } from "@/types/leadSource"
import { LEAD_SOURCES_API, send } from "./api"
import { callbackPayload, callbackState, formatCallback, relativeCallback } from "./callback"
import CallbackPicker, { EMPTY_CHOICE, resolveChoice, type CallbackChoice } from "./CallbackPicker"
import Popover from "./Popover"

interface Props {
    sourceId: string
    name: string
    callbackAt: string | null
    now: number
    onUpdated: (row: LeadSourceRow) => void
    /** Shown but not clickable. */
    disabled?: boolean
    /** "chip" on a row: nothing when no callback. "button" on the details page. */
    variant?: "chip" | "button"
    onOpenChange?: (open: boolean) => void
}

/**
 * The callback reminder.
 *
 * On a row it is a clock chip with the time. Within 15 minutes of the time
 * the clock starts to shake. Once the time has passed, the chip turns red,
 * rings and pulses, and the row moves to the top of the Today list.
 *
 * Clicking it changes the time or clears it.
 */
export default function CallbackMenu({
    sourceId,
    name,
    callbackAt,
    now,
    onUpdated,
    disabled,
    variant = "chip",
    onOpenChange,
}: Props) {
    const anchorRef = useRef<HTMLButtonElement>(null)
    const [open, setOpen] = useState(false)
    const [choice, setChoice] = useState<CallbackChoice>(EMPTY_CHOICE)
    const [note, setNote] = useState("")
    const [saving, setSaving] = useState(false)

    // If the row goes away while the menu is open, tell the list the menu
    // closed. The list pauses its auto-refresh while any menu is open.
    const openRef = useRef(false)
    openRef.current = open
    useEffect(
        () => () => {
            if (openRef.current) onOpenChange?.(false)
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    )

    if (variant === "chip" && !callbackAt) return null

    const toggle = (next: boolean) => {
        if (next) {
            setChoice(EMPTY_CHOICE)
            setNote("")
        }
        setOpen(next)
        onOpenChange?.(next)
    }

    const submit = async (clear: boolean) => {
        const at = clear ? null : resolveChoice(choice)
        if (!clear && !at) return

        setSaving(true)
        try {
            const row = await send<LeadSourceRow>(`${LEAD_SOURCES_API}/${sourceId}/callback`, "PATCH", {
                ...(at ? callbackPayload(at) : { callbackAt: null }),
                note: note.trim() || undefined,
            })
            onUpdated(row)
            toast.success(at ? `Callback set for ${formatCallback(at.toISOString())}` : "Callback cleared")
            toggle(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to set the callback")
        } finally {
            setSaving(false)
        }
    }

    const state = callbackAt ? callbackState(callbackAt, now) : null

    const trigger = callbackAt ? (
        <button
            ref={anchorRef}
            type="button"
            disabled={disabled}
            onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggle(!open)
            }}
            title={`Call back ${relativeCallback(callbackAt, now)}`}
            aria-label={`Callback ${formatCallback(callbackAt)}, ${relativeCallback(callbackAt, now)}`}
            className={clsx(
                "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap transition",
                variant === "chip" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm",
                state === "due" && "ls-callback-due border-rose-600 bg-rose-600 text-white",
                state === "soon" &&
                    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
                state === "later" &&
                    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
                disabled ? "cursor-default" : "hover:brightness-105"
            )}
        >
            <AlarmClock
                className={clsx(
                    variant === "chip" ? "h-3.5 w-3.5" : "h-4 w-4",
                    state === "due" && "ls-ring",
                    state === "soon" && "ls-ring-slow"
                )}
            />
            {formatCallback(callbackAt)}
            {variant === "button" && (
                <span className="font-normal opacity-80">· {relativeCallback(callbackAt, now)}</span>
            )}
        </button>
    ) : (
        <button
            ref={anchorRef}
            type="button"
            disabled={disabled}
            onClick={() => toggle(!open)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-violet-300 px-3 py-1 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
        >
            <AlarmClockPlus className="h-4 w-4" />
            Set callback
        </button>
    )

    return (
        <>
            {trigger}

            <Popover open={open} onClose={() => toggle(false)} anchorRef={anchorRef} label={`Callback for ${name}`} width={330}>
                <div className="space-y-3 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            Callback reminder
                        </p>
                        <p className="truncate text-xs text-neutral-400">{name}</p>
                    </div>

                    {callbackAt && (
                        <p className="rounded-lg bg-violet-50 px-2.5 py-2 text-xs text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
                            Set for {formatCallback(callbackAt)} ({relativeCallback(callbackAt, now)}).
                        </p>
                    )}

                    <CallbackPicker value={choice} onChange={setChoice} />

                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                        placeholder="Note, for example: asked for the owner (optional)"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />

                    <div className="flex items-center justify-between gap-2">
                        {callbackAt ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => submit(true)}
                                className="rounded-lg px-2 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            >
                                Clear callback
                            </button>
                        ) : (
                            <span />
                        )}
                        <button
                            type="button"
                            disabled={saving || !resolveChoice(choice)}
                            onClick={() => submit(false)}
                            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "Saving..." : callbackAt ? "Change time" : "Set callback"}
                        </button>
                    </div>
                </div>
            </Popover>
        </>
    )
}
