"use client"

import { createContext, useContext, useMemo, useState } from "react"
import {
    ALL_REGIONS,
    DEFAULT_REGION,
    REGIONS,
    resolveEffectiveRegion,
    type ActiveRegion,
    type RegionCode,
    type RegionConfig,
} from "@/lib/region"
import { useAuth } from "./AuthContext"

/**
 * Which region the signed-in person is working in.
 *
 * This used to come from NEXT_PUBLIC_REGION, one region per deployment. It now
 * comes from the user's own `regions`, because one deployment serves all of
 * them.
 *
 * Two values, and the difference matters:
 *
 *   active   what the person is looking at. `"ALL"` when they hold more than
 *            one region and have not narrowed it. Used for the badge in the
 *            header, and later for the admin region switch.
 *
 *   config   the single region to use when something needs exactly one, such
 *            as parsing a phone number typed without a country code. `"ALL"`
 *            resolves to India.
 *
 * Neither decides what a query returns. The server does that, from the user
 * row, in `src/lib/region-scope`. Nothing here is a security boundary. A
 * person could change `active` in their browser and still read only their own
 * regions, because the server never trusts it.
 */

interface RegionContextValue {
    /** Every region this person may read. Empty before /api/auth/me returns. */
    regions: RegionCode[]

    /** What they are looking at. `"ALL"` means every region they hold. */
    active: ActiveRegion

    /** Narrows the view. Rejects a region the person does not hold. */
    setActive: (next: ActiveRegion) => void

    /** True when looking at everything rather than one region. */
    isAll: boolean

    /** True when there is nothing to switch between. */
    canSwitch: boolean

    /** The single effective region. `"ALL"` resolves to India. */
    config: RegionConfig
}

const FALLBACK: RegionContextValue = {
    regions: [],
    active: DEFAULT_REGION,
    setActive: () => {},
    isAll: false,
    canSwitch: false,
    config: REGIONS[DEFAULT_REGION],
}

const RegionContext = createContext<RegionContextValue>(FALLBACK)

export function RegionProvider({ children }: { children: React.ReactNode }) {
    const { regions } = useAuth()

    // null means "not chosen", so the default below follows the user as soon
    // as /api/auth/me returns. Once they pick, their choice sticks.
    const [chosen, setChosen] = useState<ActiveRegion | null>(null)

    const value = useMemo<RegionContextValue>(() => {
        // One region: that is the answer, and there is nothing to switch to.
        // Several: show everything until they narrow it. That is the admin
        // case, and seeing all regions at once is the point of holding them.
        const fallbackActive: ActiveRegion =
            regions.length === 1 ? regions[0] : ALL_REGIONS

        // A choice that is no longer valid, because the account changed while
        // the tab was open, falls back rather than sticking.
        const isValidChoice =
            chosen === ALL_REGIONS ||
            (chosen !== null && regions.includes(chosen as RegionCode))

        const active: ActiveRegion = isValidChoice
            ? (chosen as ActiveRegion)
            : fallbackActive

        const setActive = (next: ActiveRegion) => {
            if (next === ALL_REGIONS || regions.includes(next)) {
                setChosen(next)
            }
        }

        return {
            regions,
            active,
            setActive,
            isAll: active === ALL_REGIONS,
            canSwitch: regions.length > 1,
            config: resolveEffectiveRegion(active),
        }
    }, [regions, chosen])

    return (
        <RegionContext.Provider value={value}>
            {children}
        </RegionContext.Provider>
    )
}

/**
 * The single effective region. Phone inputs and anything else that needs one
 * country use this, and they do not have to care about the "all regions" case.
 */
export function useRegion(): RegionConfig {
    return useContext(RegionContext).config
}

/** The full picture: what they hold, what they are looking at, how to change it. */
export function useRegionScope(): RegionContextValue {
    return useContext(RegionContext)
}
