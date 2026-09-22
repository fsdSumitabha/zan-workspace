"use client"

import clsx from "clsx"
import { ALL_REGIONS_META, REGIONS, type RegionCode } from "@/lib/region"
import { useRegionScope } from "@/contexts/RegionContext"
import RegionFlag from "./RegionFlag"

/**
 * Shows which region the person is working in, next to the logo.
 *
 * It answers one question at a glance: whose data am I looking at. Someone who
 * covers India and someone who covers the US see the same screens, so without
 * this the only difference is which rows appear, and that is not something you
 * notice until you have already acted on it.
 *
 * Nothing here filters anything. The server decides what a query returns, from
 * the user row. This is a label.
 */

const TONE: Record<RegionCode, string> = {
    IN: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    US: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    AE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
}

const ALL_TONE =
    "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300"

const NONE_TONE =
    "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"

export default function RegionIndicator({
    compact = false,
    className,
}: {
    /** Flag only, no name. For the mobile header, where width is scarce. */
    compact?: boolean
    className?: string
}) {
    const { regions, active, isAll } = useRegionScope()

    // Before /api/auth/me returns there is nothing true to show, and a wrong
    // region flashing on screen is worse than none.
    if (regions.length === 0) return null

    const meta = isAll ? ALL_REGIONS_META : REGIONS[active as RegionCode]
    const tone = isAll ? ALL_TONE : (TONE[active as RegionCode] ?? NONE_TONE)

    const title = isAll
        ? `Showing every region you cover: ${regions.join(", ")}`
        : `Working in ${meta.label}`

    return (
        <span
            title={title}
            aria-label={title}
            className={clsx(
                "inline-flex items-center gap-1.5 rounded-full font-medium leading-none",
                compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
                tone,
                className
            )}
        >
            <RegionFlag
                region={active}
                className={compact ? "w-[18px]" : "w-4"}
            />

            {!compact && (
                <span className="whitespace-nowrap">
                    {isAll ? ALL_REGIONS_META.label : meta.code}
                </span>
            )}
        </span>
    )
}
