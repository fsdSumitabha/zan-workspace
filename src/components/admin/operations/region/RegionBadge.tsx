import { REGIONS, type RegionCode } from "@/lib/region"

/**
 * One small pill per region, e.g. IN. The full name is the tooltip, so a row
 * of three badges stays narrow enough for a card.
 *
 * Each region gets its own colour so a wrong region is noticed at a glance
 * rather than read. The colours carry no meaning beyond telling them apart.
 */
const TONE: Record<RegionCode, string> = {
    IN: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    US: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
    AE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
}

const UNKNOWN_TONE =
    "bg-gray-200 text-gray-600 dark:bg-neutral-700 dark:text-neutral-300"

export function RegionBadge({ code }: { code: string }) {
    const region = REGIONS[code as RegionCode]

    return (
        <span
            title={region ? region.label : `Unknown region: ${code}`}
            className={`
                text-[11px] leading-none px-1.5 py-1 rounded font-medium tracking-wide
                ${region ? TONE[region.code] : UNKNOWN_TONE}
            `}
        >
            {code}
        </span>
    )
}

/**
 * A row of badges. Renders nothing visible but a dash when the list is empty,
 * which is itself worth seeing: a user with no regions can read nothing.
 */
export default function RegionBadges({
    regions,
    emptyLabel = "No region",
}: {
    regions?: string[] | null
    emptyLabel?: string
}) {
    if (!regions || regions.length === 0) {
        return (
            <span
                title="This account cannot see any records. Set a region on it."
                className="text-[11px] px-1.5 py-1 rounded font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            >
                {emptyLabel}
            </span>
        )
    }

    return (
        <span className="inline-flex flex-wrap gap-1">
            {regions.map((code) => (
                <RegionBadge key={code} code={code} />
            ))}
        </span>
    )
}
