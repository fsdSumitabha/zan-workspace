import EmailContact from "@/models/EmailContact"
import EmailSuppression from "@/models/EmailSuppression"
import { auditedCreate } from "@/lib/activity-log"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { ADDRESS_PROBLEM, readAddress } from "@/lib/email/audience/address"
import type { NewsletterBody } from "./contract"
import { IntegrationError, isDuplicateKeyError } from "./http"
import { consentSourceOf, newsletterTags, type IntegrationSite } from "./sites"

/**
 * A newsletter sign-up from a website, kept as an EmailContact.
 *
 * A sign-up is not a lead and never becomes one. A lead's enquiry is not a
 * sign-up either: the lead route never adds anyone to this list.
 *
 *   - One contact per address per region, as the import keeps them. A
 *     second sign-up updates the consent record and adds the tags.
 *   - The consent record is what the person agreed to: the words next to
 *     the box, their version, when, and on which page.
 *   - An address on the do-not-email list stays on it. A sign-up does not
 *     take it off: without a confirmation email, anyone could sign someone
 *     else up again. Only an admin removes an address from that list.
 *   - A contact an admin deleted is restored, with the new consent.
 *   - Test and throwaway domains (example.com, mailinator.com, ...) are not
 *     stored, the same rule the contact import follows.
 *
 * The website is told "subscribed" in every case, so the answer never says
 * whether an address was already on the list.
 *
 * Written as the system integration user (actor.ts): the contact's
 * createdBy, and the activity log's actor.
 *
 * The caller has set the region context to the body's region.
 */

export interface SignupOutcome {
    status: "subscribed"
    /** What happened, for the log and the tests only. */
    result: "created" | "updated" | "restored" | "suppressed" | "withdrawn" | "blocked_domain"
}

export async function receiveSignup(
    site: IntegrationSite,
    body: NewsletterBody,
    actorId: string
): Promise<SignupOutcome> {
    const { address, problem } = readAddress(body.email, { allowRoleAddresses: true })
    if (problem === ADDRESS_PROBLEM.BLOCKED_DOMAIN) return { status: "subscribed", result: "blocked_domain" }
    if (problem || !address) {
        throw new IntegrationError("The body does not match the contract.", 400, [
            { field: "email", message: "email is not a valid address" },
        ])
    }

    const region = body.region
    const key = address.normalized

    const suppressed = await EmailSuppression.findOne({ region, emailNormalized: key }).select("_id").lean()
    if (suppressed) return { status: "subscribed", result: "suppressed" }

    const consent = {
        marketingConsent: true,
        consentSource: consentSourceOf(site, body.form),
        consentAt: new Date(body.consent.at),
        consentText: body.consent.text,
        consentVersion: body.consent.version,
        consentPage: body.page ?? undefined,
    }
    const tags = newsletterTags(site)

    // Twice at most: the second time is for a contact another request
    // created between our read and our insert.
    for (let attempt = 0; attempt < 2; attempt++) {
        // Straight from the collection, so a deleted contact is found too:
        // the unique index on (region, emailNormalized) covers it.
        const raw = await EmailContact.collection.findOne({ region, emailNormalized: key })

        if (raw) {
            // Unsubscribed. The suppression row should exist too; either one is enough.
            if (raw.consentWithdrawnAt) return { status: "subscribed", result: "withdrawn" }

            // save() rather than an update, so the audit plugin records it.
            const contact = EmailContact.hydrate(raw)
            contact.$locals._auditUserId = actorId
            const restored = contact.deletedAt != null
            contact.set(consent)
            contact.tags = [...new Set([...(contact.tags ?? []), ...tags])]
            if (restored) {
                contact.deletedAt = null
                contact.deletedBy = undefined
            }
            await contact.save()
            return { status: "subscribed", result: restored ? "restored" : "updated" }
        }

        try {
            await auditedCreate(
                EmailContact,
                ENTITY_TYPE.EMAIL_CONTACT,
                {
                    region,
                    email: address.original,
                    emailNormalized: key,
                    ...consent,
                    tags,
                    createdBy: actorId,
                },
                actorId
            )
            return { status: "subscribed", result: "created" }
        } catch (error) {
            if (!isDuplicateKeyError(error) || attempt > 0) throw error
        }
    }

    // Not reached: the loop either returns or throws.
    throw new Error("The sign-up could not be saved.")
}
