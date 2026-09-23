import type { RegionCode } from "@/lib/region"

/**
 * Colours for the region pill in the header.
 *
 * One colour per region so a wrong region is noticed rather than read. The
 * colours carry no meaning beyond telling them apart, so they can change
 * freely — but they must stay distinct from each other and from the violet
 * used for "all regions".
 */
export const REGION_TONE: Record<RegionCode, string> = {
    IN: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    US: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    AE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
}

/** "All regions" is deliberately not one of the region colours. */
export const ALL_TONE =
    "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300"
