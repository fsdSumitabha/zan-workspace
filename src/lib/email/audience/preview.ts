import type { IAudienceRules } from "@/models/EmailAudience"
import {
    EXCLUSION_LABELS,
    applyEligibility,
    totalExcluded,
    type ExclusionKey,
} from "./eligibility"
import { MAX_CANDIDATES, resolveAudience } from "./resolve"

/**
 * The recipient preview: how many will get the campaign, and where
 * everyone else went.
 *
 * This is the one function the audience builder, the campaign wizard and
 * the snapshot all go through, so the number a person approves is produced
 * by the same code that later writes the rows.
 */

export interface AudiencePreview {
    /** How many records the rules matched, before anything was removed. */
    matchedTotal: number
    matched: { leads: number; clients: number; contacts: number; manual: number }
    /** How many will actually receive the campaign. */
    eligibleTotal: number
    /** Exclusions, in display order, with the zero rows dropped. */
    breakdown: Array<{ key: ExclusionKey; label: string; count: number; samples: string[] }>
    /** A handful of real recipients, so the number is not just a number. */
    sample: Array<{ email: string; name: string; sourceType: number }>
    /** True when a rule hit the safety cap and the count is a floor. */
    truncated: boolean
    /** Set when the arithmetic does not add up. Should never appear. */
    warning?: string
}

const SAMPLE_SIZE = 10

export async function previewAudience(
    rules: IAudienceRules | null | undefined,
    options: { allowRoleAddresses?: boolean; region?: string } = {}
): Promise<AudiencePreview> {
    const resolved = await resolveAudience(rules, { region: options.region })

    const { eligible, excluded, samples } = await applyEligibility(
        resolved.candidates,
        {
            rules,
            allowRoleAddresses: options.allowRoleAddresses,
            region: options.region,
        }
    )

    const matchedTotal =
        resolved.matched.leads +
        resolved.matched.clients +
        resolved.matched.contacts +
        resolved.matched.manual

    const breakdown = EXCLUSION_LABELS.filter(
        ({ key }) => excluded[key] > 0
    ).map(({ key, label }) => ({
        key,
        label,
        count: excluded[key],
        samples: samples[key] ?? [],
    }))

    /**
     * The arithmetic has to close: matched minus every exclusion is what
     * gets sent. If it ever does not, something counted a recipient twice
     * or lost one, and that is worth saying out loud rather than showing a
     * total that quietly lies.
     */
    const expected = matchedTotal - totalExcluded(excluded)
    const warning =
        !resolved.truncated && expected !== eligible.length
            ? `The counts do not add up: ${matchedTotal} matched, ` +
              `${totalExcluded(excluded)} excluded, ${eligible.length} left. ` +
              "Please report this."
            : undefined

    return {
        matchedTotal,
        matched: resolved.matched,
        eligibleTotal: eligible.length,
        breakdown,
        sample: eligible.slice(0, SAMPLE_SIZE).map((r) => ({
            email: r.email,
            name: r.name,
            sourceType: r.sourceType,
        })),
        truncated: resolved.truncated,
        warning,
    }
}

/**
 * The same pipeline, returning the recipients themselves.
 *
 * The campaign snapshot uses this. It is deliberately the same two calls in
 * the same order as the preview, so what was approved is what is written.
 */
export async function resolveEligibleRecipients(
    rules: IAudienceRules | null | undefined,
    options: { allowRoleAddresses?: boolean; region?: string } = {}
) {
    const resolved = await resolveAudience(rules, { region: options.region })
    const result = await applyEligibility(resolved.candidates, {
        rules,
        allowRoleAddresses: options.allowRoleAddresses,
        region: options.region,
    })

    return { ...result, matched: resolved.matched, truncated: resolved.truncated }
}

export { MAX_CANDIDATES }
