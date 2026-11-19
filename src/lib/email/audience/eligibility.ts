import EmailSuppression from "@/models/EmailSuppression"
import EmailContact from "@/models/EmailContact"
import type { IAudienceRules } from "@/models/EmailAudience"
import { RECIPIENT_SOURCE } from "@/constants/emailStatus"
import {
    ADDRESS_PROBLEM,
    normalizeAddress,
    readAddress,
    splitPastedAddresses,
} from "./address"
import type { Candidate } from "./resolve"

/**
 * Turns candidates into the list that will actually be sent to, and says
 * exactly why each excluded one was dropped.
 *
 * ## Why the breakdown is not optional
 *
 * When 712 leads match a filter and 486 receive the campaign, somebody has
 * to be able to see where the other 226 went. Without that, the first
 * reaction to the number is "the campaign is broken", and the second is to
 * stop trusting the tool. Every exclusion below is counted and shown.
 *
 * ## Order matters
 *
 * A recipient is counted under the FIRST reason that excludes them, in this
 * order: no address, invalid, role address, blocked domain, duplicate,
 * suppressed, no consent. So the numbers always add up to the matched
 * total, and nobody is counted twice.
 */

export const EXCLUSION = {
    NO_EMAIL: "noEmail",
    INVALID: "invalid",
    ROLE_ADDRESS: "roleAddress",
    BLOCKED_DOMAIN: "blockedDomain",
    DUPLICATE: "duplicate",
    SUPPRESSED: "suppressed",
    NO_CONSENT: "noConsent",
    EXCLUDED_BY_RULE: "excludedByRule",
} as const

export type ExclusionKey = (typeof EXCLUSION)[keyof typeof EXCLUSION]

/** Labels for the breakdown panel. Order is the order shown. */
export const EXCLUSION_LABELS: Array<{ key: ExclusionKey; label: string }> = [
    { key: EXCLUSION.NO_EMAIL, label: "No email address" },
    { key: EXCLUSION.INVALID, label: "Address is not valid" },
    { key: EXCLUSION.ROLE_ADDRESS, label: "Role address, such as info@" },
    { key: EXCLUSION.BLOCKED_DOMAIN, label: "Test or throwaway domain" },
    { key: EXCLUSION.DUPLICATE, label: "Duplicate address" },
    { key: EXCLUSION.SUPPRESSED, label: "On the suppression list" },
    { key: EXCLUSION.NO_CONSENT, label: "No marketing consent" },
    { key: EXCLUSION.EXCLUDED_BY_RULE, label: "Excluded by a rule" },
]

export interface EligibleRecipient extends Candidate {
    emailNormalized: string
}

export interface EligibilityResult {
    eligible: EligibleRecipient[]
    excluded: Record<ExclusionKey, number>
    /** A few examples per reason, so the UI can show which ones. */
    samples: Partial<Record<ExclusionKey, string[]>>
}

const SAMPLE_LIMIT = 5

export interface EligibilityOptions {
    rules?: IAudienceRules | null
    /**
     * Whether `info@`-style mailboxes are allowed. Off by default: mail to
     * them is a common source of spam complaints, because whoever reads the
     * shared inbox never signed up.
     */
    allowRoleAddresses?: boolean
}

/**
 * ## Consent
 *
 * `EmailContact` carries an explicit `marketingConsent` flag, set when the
 * contact was imported or added, and a contact without it is excluded.
 *
 * Leads and Clients are treated as eligible. They are people the business
 * already has a relationship with, and the consent for that relationship is
 * collected when the record is created rather than being stored per
 * message. The breakdown still shows a "no marketing consent" line so the
 * rule is visible rather than implied, and anyone who unsubscribes is
 * excluded by the suppression check above it, permanently.
 */
export async function applyEligibility(
    candidates: Candidate[],
    options: EligibilityOptions = {}
): Promise<EligibilityResult> {
    const excluded: Record<ExclusionKey, number> = {
        noEmail: 0,
        invalid: 0,
        roleAddress: 0,
        blockedDomain: 0,
        duplicate: 0,
        suppressed: 0,
        noConsent: 0,
        excludedByRule: 0,
    }
    const samples: Partial<Record<ExclusionKey, string[]>> = {}

    function drop(key: ExclusionKey, who: string) {
        excluded[key] += 1
        const list = (samples[key] ??= [])
        if (list.length < SAMPLE_LIMIT && who) list.push(who)
    }

    /* ---- 1. Address shape, and deduplication ---- */

    const seen = new Set<string>()
    const passed: EligibleRecipient[] = []

    for (const candidate of candidates) {
        const { address, problem } = readAddress(candidate.email, {
            allowRoleAddresses: options.allowRoleAddresses,
        })

        if (problem === ADDRESS_PROBLEM.MISSING) {
            drop(EXCLUSION.NO_EMAIL, candidate.name || "(no name)")
            continue
        }
        if (problem === ADDRESS_PROBLEM.INVALID) {
            drop(EXCLUSION.INVALID, candidate.email)
            continue
        }
        if (problem === ADDRESS_PROBLEM.ROLE) {
            drop(EXCLUSION.ROLE_ADDRESS, candidate.email)
            continue
        }
        if (problem === ADDRESS_PROBLEM.BLOCKED_DOMAIN) {
            drop(EXCLUSION.BLOCKED_DOMAIN, candidate.email)
            continue
        }

        const key = address!.normalized

        if (seen.has(key)) {
            drop(EXCLUSION.DUPLICATE, key)
            continue
        }
        seen.add(key)

        passed.push({
            ...candidate,
            email: address!.original,
            emailNormalized: key,
            mergeData: { ...candidate.mergeData, email: address!.original },
        })
    }

    /* ---- 2. Addresses the audience explicitly excludes ---- */

    const ruleExcluded = new Set<string>()
    for (const entry of options.rules?.exclude?.emails ?? []) {
        for (const part of splitPastedAddresses(entry)) {
            const n = normalizeAddress(part)
            if (n?.normalized) ruleExcluded.add(n.normalized)
        }
    }

    const afterRules = passed.filter((r) => {
        if (!ruleExcluded.has(r.emailNormalized)) return true
        drop(EXCLUSION.EXCLUDED_BY_RULE, r.emailNormalized)
        return false
    })

    if (afterRules.length === 0) {
        return { eligible: [], excluded, samples }
    }

    /* ---- 3. Suppression ---- */

    // One indexed query for the whole list, not one per recipient.
    const addresses = afterRules.map((r) => r.emailNormalized)
    const suppressedRows = await EmailSuppression.find({
        emailNormalized: { $in: addresses },
    })
        .select("emailNormalized")
        .lean<{ emailNormalized: string }[]>()

    const suppressed = new Set(suppressedRows.map((r) => r.emailNormalized))

    const afterSuppression = afterRules.filter((r) => {
        if (!suppressed.has(r.emailNormalized)) return true
        drop(EXCLUSION.SUPPRESSED, r.emailNormalized)
        return false
    })

    /* ---- 4. Consent, for stored contacts ---- */

    const contactAddresses = afterSuppression
        .filter((r) => r.sourceType === RECIPIENT_SOURCE.CONTACT)
        .map((r) => r.emailNormalized)

    let withoutConsent = new Set<string>()

    if (contactAddresses.length > 0) {
        const rows = await EmailContact.find({
            emailNormalized: { $in: contactAddresses },
            $or: [
                { marketingConsent: { $ne: true } },
                { consentWithdrawnAt: { $ne: null } },
            ],
        })
            .select("emailNormalized")
            .lean<{ emailNormalized: string }[]>()

        withoutConsent = new Set(rows.map((r) => r.emailNormalized))
    }

    const eligible = afterSuppression.filter((r) => {
        if (!withoutConsent.has(r.emailNormalized)) return true
        drop(EXCLUSION.NO_CONSENT, r.emailNormalized)
        return false
    })

    return { eligible, excluded, samples }
}

/**
 * Whether one address may be sent to right now.
 *
 * The worker calls this immediately before handing a message to SMTP. The
 * snapshot was checked when the campaign started, but a scheduled campaign
 * can sit for hours and somebody can unsubscribe in that gap. One indexed
 * lookup is nothing next to an SMTP round trip, and sending to somebody who
 * has unsubscribed is the one mistake that cannot be taken back.
 */
export async function isStillSendable(
    emailNormalized: string
): Promise<boolean> {
    const hit = await EmailSuppression.findOne({ emailNormalized })
        .select("_id")
        .lean()

    return !hit
}

/** The total of every exclusion, for the breakdown's arithmetic. */
export function totalExcluded(
    excluded: Record<ExclusionKey, number>
): number {
    return Object.values(excluded).reduce((a, b) => a + b, 0)
}
