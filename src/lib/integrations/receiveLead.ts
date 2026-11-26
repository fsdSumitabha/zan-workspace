import { Types } from "mongoose"
import type { CountryCode } from "libphonenumber-js"
import Lead from "@/models/Lead"
import Interaction from "@/models/Interaction"
import { auditedCreate, auditedFindByIdAndUpdate } from "@/lib/activity-log"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { EVENT_CODE } from "@/constants/eventTypes"
import { emitNotification } from "@/lib/notifications/emit"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { phoneLookupCondition, validatePhone } from "@/lib/phone"
import { REGIONS, type RegionCode } from "@/lib/region"
import { getRegionContext } from "@/lib/region-scope"
import type { LeadBody } from "./contract"
import { enquiryNote, type KnownLead, type NoteFacts, type ReadPhone } from "./enquiryNote"
import { isDuplicateKeyError } from "./http"
import type { IntegrationSite } from "./sites"

/**
 * An enquiry from a website, saved the way the CRM keeps every lead.
 *
 * Every lead has a phone: every lead form on both websites requires one,
 * and so does the contract. So an enquiry is matched like this:
 *
 *   1. The same person in the body's region, by phone and then by email,
 *      gets a new note on that lead. A second enquiry is never lost. A
 *      missing email address is filled in; nothing is overwritten.
 *   2. Otherwise, a lead anywhere that already has the phone number (in
 *      another region, or deleted) gets the enquiry. Lead.phone is unique
 *      across every region and every deleted lead, so a second lead with
 *      the number cannot exist. This is what the booking page does with the
 *      same collision (docs/region-rollout.md section 3.5). A deleted lead
 *      is brought back. The note says which region's site the enquiry was
 *      sent from.
 *   3. Otherwise, a new Lead in the body's region, with the website's
 *      domain as its source and the details in its first note, the way the
 *      bulk import keeps its extra columns.
 *
 * A phone is saved as E.164 when it is valid for the region's country, and
 * as typed when it is not, as the Facebook webhook does. A lead is never
 * refused over its phone.
 *
 * Everything is written as the system integration user (actor.ts): the
 * leads' and notes' createdBy, and the activity log's actor.
 *
 * The caller has set the region context to the body's region.
 */

export interface LeadOutcome {
    status: "received"
    leadId: string
    /** False when the enquiry was added to a lead the CRM already had. */
    created: boolean
}

type Found = { lead: KnownLead; by: "phone" | "email" }

function readPhone(raw: string, country: CountryCode): ReadPhone {
    const check = validatePhone(raw, country)
    return check.ok ? { value: check.e164, valid: true } : { value: raw, valid: false }
}

/** Every saved form of a valid number, or the exact text of an invalid one. */
function phoneCondition(phone: ReadPhone, country: CountryCode) {
    return phone.valid ? phoneLookupCondition(phone.value, country) : phone.value
}

const LEAD_FIELDS = "_id name email phone region"

/** The lead this person already is in the region, live leads only. */
async function findInRegion(phone: ReadPhone, email: string | null, country: CountryCode): Promise<Found | null> {
    const byPhone = await Lead.findOne({ phone: phoneCondition(phone, country) })
        .select(LEAD_FIELDS)
        .lean<KnownLead>()
    if (byPhone) return { lead: byPhone, by: "phone" }

    if (email) {
        const byEmail = await Lead.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } })
            .select(LEAD_FIELDS)
            .lean<KnownLead>()
        if (byEmail) return { lead: byEmail, by: "email" }
    }
    return null
}

/**
 * The lead that has this number anywhere: another region's, or a deleted
 * one. Read past the region and soft-delete filters on purpose, like
 * findLeadPhoneConflict, because the unique index covers them all. The whole
 * row, so a deleted one can be saved back.
 */
async function findPhoneOwner(phone: ReadPhone, country: CountryCode): Promise<KnownLead | null> {
    return Lead.collection.findOne<KnownLead>({ phone: phoneCondition(phone, country) })
}

/**
 * Lets the rest of this request write to the owner's region, as the booking
 * page does. regionScopePlugin refuses a note whose lead is outside the
 * request's regions, and this request has to add one.
 */
function allowRegion(region: RegionCode | undefined): void {
    const ctx = getRegionContext()
    if (ctx && region && !ctx.regions.includes(region)) ctx.regions = [...ctx.regions, region]
}

/** Brings back a deleted lead. save() rather than an update, so the audit plugin records it. */
async function restore(raw: KnownLead, actorId: string): Promise<void> {
    const lead = Lead.hydrate(raw)
    lead.$locals._auditUserId = actorId
    lead.set("deletedAt", null)
    lead.set("deletedBy", undefined)
    // An old row may not pass today's validators. Bringing it back must not
    // depend on that: only these two fields change.
    await lead.save({ validateBeforeSave: false })
}

async function createLead(
    site: IntegrationSite,
    body: LeadBody,
    phone: ReadPhone,
    country: CountryCode,
    actorId: string,
    now: Date
): Promise<LeadOutcome> {
    const noteId = new Types.ObjectId()

    const lead = await auditedCreate(
        Lead,
        ENTITY_TYPE.LEAD,
        {
            name: body.name,
            ...(body.email ? { email: body.email } : {}),
            phone: phone.value,
            source: site.domain,
            region: body.region,
            submittedAt: new Date(body.sentAt),
            lastInteractionAt: now,
            lastInteractionId: noteId,
            createdBy: actorId,
        },
        actorId
    )

    const note = enquiryNote(site, body, { phone, country, existing: null })
    await auditedCreate(
        Interaction,
        ENTITY_TYPE.INTERACTION,
        {
            _id: noteId,
            entityType: ENTITY_TYPE.LEAD,
            entityId: lead._id,
            type: INTERACTION_TYPE.NOTE_ADDED,
            ...note,
            createdBy: actorId,
        },
        actorId
    )

    // Runs in the body's region, so only that region's team is told. No
    // team member acted, so there is no actor, as on the booking page.
    // emitNotification never throws.
    await emitNotification({
        type: EVENT_CODE.LEAD_CREATED,
        entityType: ENTITY_TYPE.LEAD,
        entityId: lead._id,
        actor: null,
        payload: { lead: { _id: lead._id, name: lead.name, source: lead.source } },
    })

    return { status: "received", leadId: String(lead._id), created: true }
}

async function addToLead(
    site: IntegrationSite,
    body: LeadBody,
    phone: ReadPhone,
    found: Found,
    country: CountryCode,
    actorId: string,
    now: Date,
    extra: Pick<NoteFacts, "sentForRegion" | "restored"> = {}
): Promise<LeadOutcome> {
    const { lead } = found

    // Fill in what the lead is missing. Never overwrite what a person typed.
    const fill: Record<string, string> = {}
    if (!lead.email && body.email) fill.email = body.email

    const note = enquiryNote(site, body, { phone, country, existing: lead, matchedBy: found.by, ...extra })
    // The note takes the lead's region (regionScopePlugin), whichever site sent it.
    const created = await auditedCreate(
        Interaction,
        ENTITY_TYPE.INTERACTION,
        {
            entityType: ENTITY_TYPE.LEAD,
            entityId: lead._id,
            type: INTERACTION_TYPE.NOTE_ADDED,
            ...note,
            createdBy: actorId,
        },
        actorId
    )

    await auditedFindByIdAndUpdate(
        Lead,
        ENTITY_TYPE.LEAD,
        lead._id,
        { $set: { ...fill, lastInteractionAt: now, lastInteractionId: created._id } },
        {},
        actorId
    )

    await emitNotification({
        type: EVENT_CODE.NOTE_ADDED,
        entityType: ENTITY_TYPE.LEAD,
        entityId: lead._id,
        actor: null,
        payload: {
            parentUrl: `/admin/operations/leads/${lead._id}`,
            parentName: lead.name,
            title: note.title,
            description: note.description,
        },
    })

    return { status: "received", leadId: String(lead._id), created: false }
}

/** Step 2 of the match: the lead that has the number, in another region or deleted. */
async function addToOwner(
    site: IntegrationSite,
    body: LeadBody,
    phone: ReadPhone,
    owner: KnownLead,
    country: CountryCode,
    actorId: string,
    now: Date
): Promise<LeadOutcome> {
    allowRegion(owner.region)
    const restored = Boolean(owner.deletedAt)
    if (restored) await restore(owner, actorId)

    return addToLead(site, body, phone, { lead: owner, by: "phone" }, country, actorId, now, {
        sentForRegion: owner.region && owner.region !== body.region ? body.region : undefined,
        restored,
    })
}

export async function receiveLead(
    site: IntegrationSite,
    body: LeadBody,
    actorId: string,
    now: Date = new Date()
): Promise<LeadOutcome> {
    const country = REGIONS[body.region].phoneCountry
    const phone = readPhone(body.phone, country)

    const found = await findInRegion(phone, body.email, country)
    if (found) return addToLead(site, body, phone, found, country, actorId, now)

    const owner = await findPhoneOwner(phone, country)
    if (owner) return addToOwner(site, body, phone, owner, country, actorId, now)

    try {
        return await createLead(site, body, phone, country, actorId, now)
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error

        // Another request saved this number a moment ago: add to that lead.
        const winner = await findInRegion(phone, body.email, country)
        if (winner) return addToLead(site, body, phone, winner, country, actorId, now)
        const otherOwner = await findPhoneOwner(phone, country)
        if (otherOwner) return addToOwner(site, body, phone, otherOwner, country, actorId, now)
        throw error
    }
}
