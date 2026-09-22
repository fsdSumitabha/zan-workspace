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

/**
 * The "every region at once" view, for someone who holds more than one.
 *
 * Deliberately NOT a RegionCode. No record is ever stored with it, and no
 * query filter ever uses it. It only describes what the person is looking at,
 * so it cannot leak into the database by being passed to the wrong function.
 */
export const ALL_REGIONS = "ALL" as const

export type ActiveRegion = RegionCode | typeof ALL_REGIONS

// No flag here on purpose. Flags are SVGs now, in RegionFlag.tsx, because
// Windows has no country flag glyphs and emoji fall back to the letter code.
// "All regions" gets a globe icon there.
export const ALL_REGIONS_META = {
    code: ALL_REGIONS,
    label: "Planet",
} as const

/**
 * The single region to use when something needs exactly one and the person is
 * looking at all of them. A phone number typed without a country code has to
 * be parsed as somewhere, and a form field has to start on something.
 *
 * This is a display and input default only. It never decides what a query
 * returns.
 */
export function resolveEffectiveRegion(active: ActiveRegion): RegionConfig {
    return active === ALL_REGIONS ? REGIONS[DEFAULT_REGION] : REGIONS[active]
}
