"use client"

import { createContext, useContext } from "react"
import { REGIONS, getRegion, type RegionCode, type RegionConfig } from "@/lib/region"

// Outside a provider, fall back to the env region so nothing breaks.
const RegionContext = createContext<RegionConfig>(getRegion())

export function RegionProvider({
    region,
    children,
}: {
    region: RegionCode
    children: React.ReactNode
}) {
    return (
        <RegionContext.Provider value={REGIONS[region]}>
            {children}
        </RegionContext.Provider>
    )
}

export function useRegion(): RegionConfig {
    return useContext(RegionContext)
}
