"use client"

import clsx from "clsx"
import { AlarmClock } from "lucide-react"
import { CALLBACK_PRESETS, formatCallback, relativeCallback, toDateTimeLocal } from "./callback"
import { useNow } from "./useNow"

export interface CallbackChoice {
    /** Index into CALLBACK_PRESETS, or null. */
    preset: number | null
    /** Value of the exact-time input, "YYYY-MM-DDTHH:mm", or "". */
    custom: string
}

export const EMPTY_CHOICE: CallbackChoice = { preset: null, custom: "" }

/** The moment a choice points at. Presets are worked out from now. */
export function resolveChoice(choice: CallbackChoice): Date | null {
    if (choice.preset !== null) return CALLBACK_PRESETS[choice.preset].at()
    if (choice.custom) {
        const date = new Date(choice.custom)
        return Number.isNaN(date.getTime()) ? null : date
    }
    return null
}

/**
 * Quick callback times, plus an exact time. "Call me after 2 hours" is one
 * tap. "Call me at 12" is the time field.
 */
export default function CallbackPicker({
    value,
    onChange,
}: {
    value: CallbackChoice
    onChange: (next: CallbackChoice) => void
}) {
    // Its own clock, so "in 25 min" stays true while the menu is open. It
    // only runs while the picker is on screen.
    const now = useNow(15_000)
    const at = resolveChoice(value)

    return (
        <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Call back in</p>

            <div className="flex flex-wrap gap-1.5">
                {CALLBACK_PRESETS.map((preset, i) => (
                    <button
                        key={preset.label}
                        type="button"
                        onClick={() => onChange({ preset: i, custom: "" })}
                        className={clsx(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                            value.preset === i
                                ? "border-violet-600 bg-violet-600 text-white"
                                : "border-slate-300 text-neutral-700 hover:border-violet-400 hover:text-violet-700 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-violet-400 dark:hover:text-violet-300"
                        )}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="shrink-0">or at</span>
                <input
                    type="datetime-local"
                    value={value.custom}
                    min={toDateTimeLocal(new Date(now))}
                    onChange={(e) => onChange({ preset: null, custom: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-neutral-800 [color-scheme:light] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:[color-scheme:dark]"
                />
            </label>

            {at && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                    <AlarmClock className="h-3.5 w-3.5" />
                    {formatCallback(at.toISOString())}
                    <span className="font-normal text-neutral-500 dark:text-neutral-400">
                        ({relativeCallback(at.toISOString(), now)})
                    </span>
                </p>
            )}
        </div>
    )
}
