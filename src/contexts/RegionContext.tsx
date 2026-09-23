"use client"

import { createContext, useContext, useMemo, useState } from "react"
import { toast } from "sonner"
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
 *            one region and have not narrowed it.
 *
 *   config   the single region to use when something needs exactly one, such
 *            as parsing a phone number typed without a country code. `"ALL"`
 *            resolves to India.
 *
 * ## Switching
 *
 * `setActive` posts to `/api/auth/region`, which sets a cookie. `requireAuth`
 * reads that cookie and narrows the region scope for every API route at once.
 * Nothing else in the app has to know a switch happened.
 *
 * The server is the authority. This context is seeded from `/api/auth/me`, so
 * a reload can never show a different region from the one the APIs are using.
 * Local state only exists so the badge updates without a round trip to
 * `/api/auth/me` after a switch.
 */

interface RegionContextValue {
    /** Every region this person may read. Empty before /api/auth/me returns. */
    regions: RegionCode[]

    /** What they are looking at. `"ALL"` means every region they hold. */
    active: ActiveRegion

    /** Narrows the session, or restores everything with `"ALL"`. */
    setActive: (next: ActiveRegion) => Promise<void>

    /** True while a switch is in flight. */
    switching: boolean

    /** True when looking at everything rather than one region. */
    isAll: boolean

    /** True when there is anything to switch between. */
    canSwitch: boolean

    /** The single effective region. `"ALL"` resolves to India. */
    config: RegionConfig
}

const FALLBACK: RegionContextValue = {
    regions: [],
    active: DEFAULT_REGION,
    setActive: async () => {},
    switching: false,
    isAll: false,
    canSwitch: false,
    config: REGIONS[DEFAULT_REGION],
}

const RegionContext = createContext<RegionContextValue>(FALLBACK)

export function RegionProvider({ children }: { children: React.ReactNode }) {
    const { user, regions, refreshUser } = useAuth()

    // Set only after a switch in this tab. Until then the server's answer
    // from /api/auth/me is used, so a reload shows the truth.
    const [override, setOverride] = useState<ActiveRegion | null>(null)
    const [switching, setSwitching] = useState(false)

    const serverActive: ActiveRegion =
        user?.activeRegion ??
        (regions.length === 1 ? regions[0] : ALL_REGIONS)

    const active: ActiveRegion = override ?? serverActive

    const value = useMemo<RegionContextValue>(() => {
        const setActive = async (next: ActiveRegion) => {
            if (next === active) return

            if (next !== ALL_REGIONS && !regions.includes(next)) return

            setSwitching(true)

            try {
                const res = await fetch("/api/auth/region", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ region: next }),
                })

                const json = await res.json().catch(() => null)

                if (!res.ok || !json?.success) {
                    throw new Error(json?.message || "Failed to switch region")
                }

                // Trust the server's answer, not the request.
                setOverride(json.data.active as ActiveRegion)

                // Every list in the app is now scoped differently. Reloading
                // is blunt, but it is honest: anything already on screen was
                // fetched under the old region and is no longer what the user
                // is looking at.
                window.location.reload()
            } catch (err) {
                setSwitching(false)
                toast.error(
                    err instanceof Error ? err.message : "Failed to switch region"
                )
            }
        }

        return {
            regions,
            active,
            setActive,
            switching,
            isAll: active === ALL_REGIONS,
            canSwitch: regions.length > 1,
            config: resolveEffectiveRegion(active),
        }
        // refreshUser is stable enough here; it is only used on failure paths.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regions, active, switching, refreshUser])

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
