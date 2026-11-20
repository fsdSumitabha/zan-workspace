import { MAIL_ACCOUNT, mailAccountConnection } from "@/lib/mail/accounts"
import { providerCapabilities } from "@/lib/email/config/providerConfig"

/**
 * Whether the provider confirms deliveries at all.
 *
 * This is the one fact that decides whether a delivery figure is a real
 * measurement or an absence of one. Gmail reports no deliveries, so with
 * Gmail a delivered count of zero means "not measured", and the report
 * shows an em dash rather than 0%.
 *
 * It used to read a per-region provider row. There is one sending account
 * now, from SALES_SMTP_*, so the answer no longer varies by region. The
 * region argument is kept because the callers have one and a future
 * per-region account would need it again.
 *
 * With no account configured the honest answer is no: nothing has
 * confirmed anything.
 */
export async function reportsDelivery(_region: string): Promise<boolean> {
    const account = mailAccountConnection(MAIL_ACCOUNT.SALES)
    if (!account) return false

    return providerCapabilities(account.host).reportsDelivery
}

/**
 * The same answer for several regions at once.
 *
 * The comparison screen can hold campaigns from more than one region. The
 * answer is the same for all of them now, but the shape is kept so the
 * callers do not have to care.
 */
export async function reportsDeliveryByRegion(
    regions: string[]
): Promise<Map<string, boolean>> {
    const unique = Array.from(new Set(regions))
    const result = new Map<string, boolean>()

    if (unique.length === 0) return result

    const account = mailAccountConnection(MAIL_ACCOUNT.SALES)
    const answer = account
        ? providerCapabilities(account.host).reportsDelivery
        : false

    for (const region of unique) result.set(region, answer)

    return result
}
