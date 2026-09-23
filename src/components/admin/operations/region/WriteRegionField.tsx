"use client"

import { useState } from "react"
import { useRegionScope } from "@/contexts/RegionContext"
import {
    ALL_REGIONS,
    DEFAULT_REGION,
    REGIONS,
    type RegionCode,
} from "@/lib/region"
import { RegionBadge } from "./RegionBadge"

/**
 * The region a new lead or client is saved in.
 *
 * The choices are the regions the person is viewing now, not every region
 * they hold:
 *
 *   - Viewing all regions: a dropdown, India preselected.
 *   - Pinned to one region, or holding only one: that region, fixed.
 *
 * Pinned is fixed on purpose. The form opens the new record after saving,
 * and a session pinned to US cannot read an IN record, so the page would say
 * "not found". The server applies the same rule in resolveWriteRegion.
 */
export function useWriteRegion() {
    const { regions, active } = useRegionScope()

    const options: RegionCode[] = active === ALL_REGIONS ? regions : [active]

    // Null until the person picks. Until then the default follows the
    // options, which are empty until /api/auth/me returns.
    const [picked, setPicked] = useState<RegionCode | null>(null)

    const fallback = options.includes(DEFAULT_REGION)
        ? DEFAULT_REGION
        : options[0] ?? null

    const value = picked && options.includes(picked) ? picked : fallback

    return {
        value,
        setValue: setPicked,
        options,
        pinned: active !== ALL_REGIONS && regions.length > 1,
    }
}

interface Props {
    id: string
    value: RegionCode | null
    onChange: (next: RegionCode) => void
    options: RegionCode[]
    pinned: boolean
}

export default function WriteRegionField({
    id,
    value,
    onChange,
    options,
    pinned,
}: Props) {
    return (
        <div>
            <label
                htmlFor={id}
                className="block text-sm mb-1 text-gray-600 dark:text-gray-300"
            >
                Region *
            </label>

            {options.length > 1 ? (
                <select
                    id={id}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value as RegionCode)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                >
                    {options.map((code) => (
                        <option key={code} value={code}>
                            {REGIONS[code].label} ({code})
                        </option>
                    ))}
                </select>
            ) : (
                <div
                    id={id}
                    className="w-full px-3 py-2 rounded-lg border bg-gray-50 dark:bg-neutral-800/60 dark:border-neutral-700 text-gray-800 dark:text-gray-200 flex items-center gap-2"
                >
                    {value ? (
                        <>
                            <RegionBadge code={value} />
                            <span>{REGIONS[value].label}</span>
                        </>
                    ) : (
                        <span className="text-gray-400">Loading...</span>
                    )}
                </div>
            )}

            {pinned && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    To save in another region, switch region in the header.
                </p>
            )}
        </div>
    )
}
