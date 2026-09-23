"use client"

import { useEffect, useRef, useState } from "react"
import clsx from "clsx"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { ALL_REGIONS, ALL_REGIONS_META, REGIONS, type ActiveRegion } from "@/lib/region"
import { useRegionScope } from "@/contexts/RegionContext"
import RegionFlag from "./RegionFlag"
import { REGION_TONE, ALL_TONE } from "./tone"

/**
 * Switches the session between the regions the account holds.
 *
 * Someone with one region gets a plain badge with nothing to click. There is
 * nothing to switch to, and a dropdown that only ever has one entry is a
 * worse lie than no dropdown.
 *
 * Picking a region narrows every API for this session, because `requireAuth`
 * reads the cookie this sets. Picking "All regions" restores everything the
 * account holds.
 */
export default function RegionSwitcher({
    compact = false,
    className,
}: {
    /** Flag only, no name. For the mobile header. */
    compact?: boolean
    className?: string
}) {
    const { regions, active, setActive, switching, isAll, canSwitch } =
        useRegionScope()

    const [open, setOpen] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return

        const onPointer = (e: MouseEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false)
        }

        document.addEventListener("mousedown", onPointer)
        document.addEventListener("keydown", onKey)

        return () => {
            document.removeEventListener("mousedown", onPointer)
            document.removeEventListener("keydown", onKey)
        }
    }, [open])

    // Before /api/auth/me returns there is nothing true to show, and a wrong
    // region flashing on screen is worse than none.
    if (regions.length === 0) return null

    const meta = isAll ? ALL_REGIONS_META : REGIONS[active as Exclude<ActiveRegion, "ALL">]
    const tone = isAll ? ALL_TONE : REGION_TONE[active as Exclude<ActiveRegion, "ALL">]

    const label = isAll ? ALL_REGIONS_META.label : meta.code

    const pill = clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium leading-none",
        compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
        tone
    )

    /* ------------------------ nothing to switch between ----------------------- */

    if (!canSwitch) {
        return (
            <span
                title={`Working in ${meta.label}`}
                aria-label={`Working in ${meta.label}`}
                className={clsx(pill, className)}
            >
                <RegionFlag region={active} className={compact ? "w-[18px]" : "w-4"} />
                {!compact && <span className="whitespace-nowrap">{label}</span>}
            </span>
        )
    }

    /* --------------------------------- switch --------------------------------- */

    const options: ActiveRegion[] = [ALL_REGIONS, ...regions]

    return (
        <div ref={boxRef} className={clsx("relative", className)}>
            <button
                type="button"
                disabled={switching}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                title={
                    isAll
                        ? `Showing every region you cover: ${regions.join(", ")}. Click to narrow.`
                        : `Working in ${meta.label}. Click to change.`
                }
                className={clsx(
                    pill,
                    "transition hover:opacity-80 disabled:opacity-50",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                )}
            >
                {switching ? (
                    <Loader2 className={clsx("animate-spin", compact ? "w-[18px] h-[18px]" : "w-4 h-4")} />
                ) : (
                    <RegionFlag region={active} className={compact ? "w-[18px]" : "w-4"} />
                )}

                {!compact && <span className="whitespace-nowrap">{label}</span>}

                <ChevronDown
                    className={clsx(
                        "w-3 h-3 shrink-0 transition-transform",
                        open && "rotate-180"
                    )}
                />
            </button>

            {open && (
                <div
                    role="listbox"
                    className={clsx(
                        "absolute z-50 mt-2 w-52 p-1 rounded-xl shadow-lg ring-1",
                        compact ? "left-0" : "right-0",
                        "bg-white ring-black/5",
                        "dark:bg-neutral-900 dark:ring-white/10 dark:shadow-black/40"
                    )}
                >
                    {options.map((code) => {
                        const isActive = code === active
                        const optMeta =
                            code === ALL_REGIONS
                                ? ALL_REGIONS_META
                                : REGIONS[code]

                        return (
                            <button
                                key={code}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                    setOpen(false)
                                    setActive(code)
                                }}
                                className={clsx(
                                    "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                                    "text-neutral-700 dark:text-neutral-200",
                                    "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                    isActive && [
                                        "bg-blue-50 text-blue-700 hover:bg-blue-50",
                                        "dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/15",
                                    ]
                                )}
                            >
                                <RegionFlag region={code} className="w-4" />

                                <span className="flex-1 text-sm leading-tight">
                                    {optMeta.label}
                                </span>

                                {isActive && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
