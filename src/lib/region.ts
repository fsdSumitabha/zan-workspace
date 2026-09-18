// Region settings. One region per deployment.
//
// Today the region comes from NEXT_PUBLIC_REGION ("IN", "US" or "AE",
// case-insensitive). An unset or unknown value falls back to "IN", which was
// the behaviour before regions existed.
//
// getRegion() is the only place that reads the env. The server routes call
// it, and the root layout passes its code to <RegionProvider>. To load the
// region from somewhere else later, change getRegion() and that one prop.
//
// This file has no server-only imports and is safe on the client.

import type { CountryCode } from "libphonenumber-js"

export const REGION_CODES = ["IN", "US", "AE"] as const

export type RegionCode = (typeof REGION_CODES)[number]

export interface RegionConfig {
    code: RegionCode
    label: string
    // Country used for phone numbers typed without a "+country code",
    // and for old saved numbers that have no country code.
    phoneCountry: CountryCode
}

export const REGIONS: Record<RegionCode, RegionConfig> = {
    IN: { code: "IN", label: "India", phoneCountry: "IN" },
    US: { code: "US", label: "United States", phoneCountry: "US" },
    AE: { code: "AE", label: "United Arab Emirates", phoneCountry: "AE" },
}

export const DEFAULT_REGION: RegionCode = "IN"

export function parseRegionCode(raw: unknown): RegionCode {
    const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
    return (REGION_CODES as readonly string[]).includes(code)
        ? (code as RegionCode)
        : DEFAULT_REGION
}

export function getRegion(): RegionConfig {
    return REGIONS[parseRegionCode(process.env.NEXT_PUBLIC_REGION)]
}
