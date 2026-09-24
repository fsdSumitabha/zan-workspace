"use client"

import { useEffect, useRef, useState } from "react"
import clsx from "clsx"
import { toast } from "sonner"
import { ChevronDown, Loader2 } from "lucide-react"
import {
    LEAD_SOURCE_PICKABLE_STATUSES,
    LEAD_SOURCE_STATUS,
    LEAD_SOURCE_STATUS_META,
    type LeadSourceStatus,
} from "@/constants/leadSourceStatus"
import { todayString } from "@/lib/lead-sources/day"
import type { LeadSourceRow } from "@/types/leadSource"
import { LEAD_SOURCES_API, send } from "./api"
import { callbackPayload, formatCallback } from "./callback"
import CallbackPicker, { EMPTY_CHOICE, resolveChoice, type CallbackChoice } from "./CallbackPicker"
import Popover from "./Popover"

interface Props {
    sourceId: string
    name: string
    status: number
    onUpdated: (row: LeadSourceRow) => void
    /** Shown but not clickable, for example while rows are being selected. */
    disabled?: boolean
    size?: "sm" | "md"
    onOpenChange?: (open: boolean) => void
}

/**
 * The status badge, and the menu behind it.
 *
 * One step for the whole outcome of a call: pick the status, add a short
 * note, and for Call Back pick when. Enter in the note saves.
 */
export default function StatusMenu({ sourceId, name, status, onUpdated, disabled, size = "sm", onOpenChange }: Props) {
    const buttonRef = useRef<HTMLButtonElement>(null)
    const [open, setOpen] = useState(false)
    const [picked, setPicked] = useState<LeadSourceStatus>(status as LeadSourceStatus)
    const [note, setNote] = useState("")
    const [choice, setChoice] = useState<CallbackChoice>(EMPTY_CHOICE)
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

    const meta = LEAD_SOURCE_STATUS_META[status as LeadSourceStatus] ?? LEAD_SOURCE_STATUS_META[LEAD_SOURCE_STATUS.NEW]
    const converted = status === LEAD_SOURCE_STATUS.CONVERTED
    const locked = disabled || converted

    const toggle = (next: boolean) => {
        if (next) {
            setPicked(status as LeadSourceStatus)
            setNote("")
            setChoice(EMPTY_CHOICE)
        }
        setOpen(next)
        onOpenChange?.(next)
    }

    const isCallBack = picked === LEAD_SOURCE_STATUS.CALL_BACK
    const hasTime = !!resolveChoice(choice)
    const changed = picked !== status || note.trim() !== "" || isCallBack
    const canSave = !saving && changed && (!isCallBack || hasTime)

    const save = async () => {
        if (!canSave) return

        const at = isCallBack ? resolveChoice(choice) : null
        setSaving(true)
        try {
            const row = await send<LeadSourceRow>(`${LEAD_SOURCES_API}/${sourceId}/status`, "PATCH", {
                status: picked,
                note: note.trim() || undefined,
                today: todayString(),
                ...(at ? callbackPayload(at) : {}),
            })
            onUpdated(row)
            toast.success(
                row.callbackAt && isCallBack
                    ? `Callback set for ${formatCallback(row.callbackAt)}`
                    : `${name}: ${LEAD_SOURCE_STATUS_META[picked].label}`
            )
            toggle(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update the status")
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                disabled={locked}
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggle(!open)
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                title={converted ? "Converted to a lead" : disabled ? meta.label : "Change status"}
                className={clsx(
                    "inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap shadow-sm transition",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                    size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-sm",
                    meta.color,
                    locked ? "cursor-default" : "hover:brightness-110"
                )}
            >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {meta.label}
                {!locked && <ChevronDown className="h-3 w-3 opacity-80" />}
            </button>

            <Popover open={open} onClose={() => toggle(false)} anchorRef={buttonRef} label={`Status of ${name}`} width={330}>
                <div className="space-y-3 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            Result of the call
                        </p>
                        <p className="truncate text-xs text-neutral-400">{name}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Status">
                        {LEAD_SOURCE_PICKABLE_STATUSES.map((s) => {
                            const m = LEAD_SOURCE_STATUS_META[s]
                            const active = picked === s
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => setPicked(s)}
                                    className={clsx(
                                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition",
                                        active
                                            ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100"
                                            : "border-slate-200 text-neutral-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                    )}
                                >
                                    <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", m.dot)} />
                                    <span className="truncate">{m.label}</span>
                                    {s === status && (
                                        <span className="ml-auto text-[10px] text-neutral-400">now</span>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {isCallBack && <CallbackPicker value={choice} onChange={setChoice} />}

                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                save()
                            }
                        }}
                        rows={2}
                        maxLength={2000}
                        placeholder="What happened on the call? (optional)"
                        className="w-full resize-none rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />

                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-neutral-400">
                            {isCallBack && !hasTime ? "Pick when to call back." : "Enter saves. Shift+Enter adds a line."}
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => toggle(false)}
                                className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                disabled={!canSave}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            </Popover>
        </>
    )
}
