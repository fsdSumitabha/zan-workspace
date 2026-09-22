"use client"

import clsx from "clsx"
import { Globe } from "lucide-react"
import AE from "country-flag-icons/react/3x2/AE"
import IN from "country-flag-icons/react/3x2/IN"
import US from "country-flag-icons/react/3x2/US"
import { ALL_REGIONS, REGIONS, type ActiveRegion } from "@/lib/region"

/**
 * The real flag of a region, as an SVG.
 *
 * Not emoji. Windows has no country flag glyphs, so it falls back to the two
 * letter code in a box, and the flag never appears for most of the team.
 *
 * Not a lucide icon either. Lucide has no country flags, only a generic
 * pennant.
 *
 * These come from `country-flag-icons`, which ships with
 * `react-phone-number-input` and is already in the tree. Imported one country
 * at a time, so the other 250 are never pulled in.
 *
 * "All regions" has no flag, so it gets a globe.
 */

const FLAGS = { IN, US, AE } as const

export default function RegionFlag({
    region,
    className,
}: {
    region: ActiveRegion
    className?: string
}) {
    // 3x2 is the aspect ratio of the source SVGs. A fixed width with `h-auto`
    // keeps them from stretching, and the ring stops a white stripe from
    // disappearing into a light background.
    const box = clsx("shrink-0 rounded-[2px]", className ?? "w-4")

    if (region === ALL_REGIONS) {
        return (
            <Globe
                aria-hidden
                className={clsx("shrink-0", className ?? "w-4 h-4")}
            />
        )
    }

    const Flag = FLAGS[region]

    if (!Flag) return null

    return (
        <Flag
            aria-hidden
            title={REGIONS[region].label}
            className={clsx(box, "h-auto ring-1 ring-black/10 dark:ring-white/20")}
        />
    )
}
