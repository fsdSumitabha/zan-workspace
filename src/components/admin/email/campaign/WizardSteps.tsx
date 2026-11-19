"use client"

import clsx from "clsx"
import { Check } from "lucide-react"

/**
 * The progress indicator across the top of the wizard.
 *
 * A step that is already done can be clicked to go back. A step ahead
 * cannot: the later ones depend on choices made earlier, and letting
 * somebody jump to Review before picking a template produces a screen
 * full of blanks rather than a useful shortcut.
 */
export default function WizardSteps({
    steps,
    current,
    furthest,
    onGo,
}: {
    steps: string[]
    current: number
    /** The furthest step reached, so going back and forward is allowed. */
    furthest: number
    onGo: (step: number) => void
}) {
    // A plain flex row below.
    //
    // Not the `w-0 min-w-full sm:min-w-0` trick used elsewhere in the app:
    // that only works when a sibling or an ancestor stretches the element
    // back out, as in the lead source view tabs where it sits next to a
    // `sm:flex-1`. Here it is a block-level child with nothing to stretch
    // it, so at `sm` and above both width and min-width resolve to 0 and
    // the whole bar collapses to its padding.
    return (
        <ol className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            {steps.map((label, index) => {
                const done = index < furthest
                const active = index === current
                const reachable = index <= furthest

                return (
                    <li key={label} className="min-w-0 flex-1">
                        <button
                            type="button"
                            disabled={!reachable}
                            onClick={() => reachable && onGo(index)}
                            aria-current={active ? "step" : undefined}
                            className={clsx(
                                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
                                active
                                    ? "bg-emerald-600 text-white"
                                    : reachable
                                      ? "text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                      : "cursor-not-allowed text-slate-300 dark:text-neutral-700"
                            )}
                        >
                            <span
                                className={clsx(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                                    active
                                        ? "bg-white/20"
                                        : done
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                          : "bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500"
                                )}
                            >
                                {done && !active ? <Check size={11} /> : index + 1}
                            </span>
                            <span className="hidden truncate text-xs font-medium md:block">
                                {label}
                            </span>
                        </button>
                    </li>
                )
            })}
        </ol>
    )
}
