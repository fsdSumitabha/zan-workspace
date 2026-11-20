import { getRegionContext } from "@/lib/region-scope"
import type { RegionCode } from "@/lib/region"

/**
 * The one region this request is looking at, or null when it is looking at
 * several.
 *
 * ## Why this exists instead of resolveWriteRegion
 *
 * `resolveWriteRegion` answers a different question: "where does this NEW
 * record go?". It throws when the answer is ambiguous, which is right for a
 * write and wrong for a read. An admin holding IN, US and AE sits on "all
 * regions" by default, and asking them to pick one before they can READ a
 * page is a bug, not a safety feature.
 *
 * Most read routes need nothing at all: regionScopePlugin already filters
 * every find, count and aggregate to the regions in view. This helper is
 * only for the handful of screens whose data is genuinely per-region and
 * cannot be merged, such as one SMTP connection and one set of delivery
 * limits. Those show a "pick a region" state instead of an error.
 */
export function pinnedRegion(): RegionCode | null {
    const ctx = getRegionContext()
    if (!ctx || ctx.bypass) return null
    return ctx.writeRegion
}

/** Every region this request may read. Empty when there is no context. */
export function regionsInView(): RegionCode[] {
    const ctx = getRegionContext()
    if (!ctx || ctx.bypass) return []
    return ctx.regions ?? []
}
