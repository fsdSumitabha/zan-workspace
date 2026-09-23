"use client"

import { useState } from "react"
import { useRegionScope } from "@/contexts/RegionContext"
import {
    ALL_REGIONS,
    DEFAULT_REGION,
    REGIONS,
    type RegionCode,
} from "@/lib/region"
import RegionFlag from "./RegionFlag"

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
 *
 * It shows the flag and the code only, like the header switch, so it fits a
 * narrow column. The full name is the tooltip. A native <select> cannot draw
 * an SVG inside an option, so the selected flag is laid over the select.
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
                <div className="relative">
                    {value && (
                        <RegionFlag
                            region={value}
                            className="w-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        />
                    )}
                    <select
                        id={id}
                        value={value ?? ""}
                        onChange={(e) => onChange(e.target.value as RegionCode)}
                        title={value ? REGIONS[value].label : undefined}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    >
                        {options.map((code) => (
                            <option key={code} value={code} title={REGIONS[code].label}>
                                {code}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <div
                    id={id}
                    title={
                        value
                            ? REGIONS[value].label +
                              (pinned ? ". To save in another region, switch region in the header." : "")
                            : undefined
                    }
                    className="w-full px-3 py-2 rounded-lg border bg-gray-50 dark:bg-neutral-800/60 dark:border-neutral-700 text-gray-800 dark:text-gray-200 flex items-center gap-2"
                >
                    {value ? (
                        <>
                            <RegionFlag region={value} className="w-5" />
                            <span>{value}</span>
                        </>
                    ) : (
                        <span className="text-gray-400">...</span>
                    )}
                </div>
            )}
        </div>
    )
}
