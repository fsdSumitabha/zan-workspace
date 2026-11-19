import EmailProviderConfig, {
    type IEmailProviderConfig,
} from "@/models/EmailProviderConfig"
import { providerCapabilities } from "@/lib/email/config/providerConfig"

/**
 * Whether a region's provider confirms deliveries at all.
 *
 * This is the one fact that decides whether a delivery figure is a real
 * measurement or an absence of one. Gmail reports no deliveries, so with
 * Gmail a delivered count of zero means "not measured", and the report
 * shows nothing rather than 0%.
 *
 * With no provider configured the honest answer is no: nothing has
 * confirmed anything.
 */
export async function reportsDelivery(region: string): Promise<boolean> {
    const provider = await EmailProviderConfig.findOne({ region })
        .sort({ isDefault: -1, createdAt: 1 })
        .select("host")
        .lean<IEmailProviderConfig>()

    if (!provider) return false

    return providerCapabilities(provider.host).reportsDelivery
}

/**
 * The same answer for several regions at once.
 *
 * The comparison screen can hold campaigns from more than one region, and
 * one query per campaign would be a query per row.
 */
export async function reportsDeliveryByRegion(
    regions: string[]
): Promise<Map<string, boolean>> {
    const unique = Array.from(new Set(regions))

    if (unique.length === 0) return new Map()

    const rows = await EmailProviderConfig.find({ region: { $in: unique } })
        .sort({ isDefault: -1, createdAt: 1 })
        .select("region host")
        .lean<IEmailProviderConfig[]>()

    const result = new Map<string, boolean>()

    // Sorted default-first, so the first row seen for a region is the one
    // that would actually send, and later rows must not overwrite it.
    for (const row of rows) {
        if (result.has(row.region)) continue
        result.set(row.region, providerCapabilities(row.host).reportsDelivery)
    }

    for (const region of unique) {
        if (!result.has(region)) result.set(region, false)
    }

    return result
}
