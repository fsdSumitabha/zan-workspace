import "../ad-tracking/testing/tsxPhoneFix"
import "../ad-tracking/testing/testEnv"
import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { connectTestDb, disconnectTestDb, clearCollections, withoutRegionScope } from "@/lib/email/testing/db"
import { EVENT_CODE } from "@/constants/eventTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { SUPPRESSION_REASON } from "@/constants/emailStatus"
import ActivityLog from "@/models/ActivityLog"
import EmailContact from "@/models/EmailContact"
import EmailSuppression from "@/models/EmailSuppression"
import IntegrationReceipt from "@/models/IntegrationReceipt"
import Interaction from "@/models/Interaction"
import Lead from "@/models/Lead"
import Notification from "@/models/Notification"
import User from "@/models/User"
import { POST as postLead } from "@/app/api/integrations/leads/route"
import { POST as postSignup } from "@/app/api/integrations/newsletter/route"

/**
 * Both website routes against a real MongoDB: the `_test` database only,
 * see src/lib/email/testing/db.ts. Run with `npm test`.
 *
 * The routes are called the way a website's server calls them: a POST
 * with a Bearer key, JSON, and an id that a retry repeats.
 */

const KEY = { zanservices: "s".repeat(40), zanverse: "v".repeat(40) }
process.env.ZANSERVICES_SITE_API_KEY = KEY.zanservices
process.env.ZANVERSE_TECHNOLOGIES_SITE_API_KEY = KEY.zanverse
// The system integration user every website record is written as.
const BOT = "64b000000000000000000090"
process.env.ZANSERVICES_USER_ID = BOT

const MODELS = [Lead, Interaction, ActivityLog, EmailContact, EmailSuppression, IntegrationReceipt, Notification, User]

type Route = (req: Request) => Promise<Response>

async function call(
    route: Route,
    body: unknown,
    options: { key?: string | null; headers?: Record<string, string> } = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
    const headers: Record<string, string> = { "content-type": "application/json", ...options.headers }
    if (options.key !== null) headers.authorization = `Bearer ${options.key ?? KEY.zanservices}`
    const res = await route(
        new Request("http://localhost/api/integrations", {
            method: "POST",
            headers,
            body: typeof body === "string" ? body : JSON.stringify(body),
        })
    )
    return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

function lead(over: Record<string, unknown> = {}) {
    return {
        id: randomUUID(),
        source: "zanservices",
        sentAt: "2026-11-26T10:00:00.000Z",
        region: "IN",
        form: "contact_form",
        page: "zanservices.com/contact-us?utm_source=google",
        name: "Asha Rao",
        email: "asha@company.in",
        phone: "98300 12345",
        service: "Web Development",
        message: "We need a website.",
        ...over,
    }
}

function signup(over: Record<string, unknown> = {}) {
    return {
        id: randomUUID(),
        source: "zanservices",
        sentAt: "2026-11-26T10:00:00.000Z",
        region: "IN",
        form: "newsletter_form",
        page: "zanservices.com/blog?utm_source=linkedin",
        email: "Reader@Company.in",
        consent: { text: "Yes, email me the newsletter.", version: "2026-11-25", at: "2026-11-26T10:00:00.000Z" },
        ...over,
    }
}

const allLeads = () => withoutRegionScope(() => Lead.find({}).sort({ createdAt: 1 }).lean())
const notesOf = (leadId: unknown) =>
    withoutRegionScope(() => Interaction.find({ entityId: leadId }).sort({ createdAt: 1 }).lean())
const allContacts = () => withoutRegionScope(() => EmailContact.collection.find({}).toArray())

before(async () => {
    await connectTestDb()
    for (const model of MODELS) await model.createIndexes()
})

after(async () => {
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(() => clearCollections(MODELS))
})

/* ── Leads ─────────────────────────────────────────────────────────────── */

test("a new enquiry becomes a lead in its region, with the details in its first note", async () => {
    const res = await call(postLead, lead())
    assert.equal(res.status, 200)
    assert.deepEqual(res.json, { success: true, status: "received" })

    const [saved] = await allLeads()
    assert.equal(saved.name, "Asha Rao")
    assert.equal(saved.email, "asha@company.in")
    // Typed with no country code: read as an Indian number, saved as E.164.
    assert.equal(saved.phone, "+919830012345")
    assert.equal(saved.source, "zanservices.com")
    assert.equal(saved.region, "IN")
    assert.equal(String(saved.createdBy), BOT)
    assert.equal(saved.submittedAt?.toISOString(), "2026-11-26T10:00:00.000Z")

    // The activity log names the bot, as for the booking page's leads.
    const logged = await ActivityLog.find({ entityId: saved._id }).lean()
    assert.ok(logged.length > 0)
    assert.ok(logged.every((row) => String(row.userId) === BOT))

    const notes = await notesOf(saved._id)
    assert.equal(notes.length, 1)
    assert.equal(String(notes[0].createdBy), BOT)
    assert.equal(notes[0].type, INTERACTION_TYPE.NOTE_ADDED)
    assert.equal(notes[0].region, "IN")
    assert.equal(notes[0].title, "Enquiry from zanservices.com")
    assert.match(notes[0].description ?? "", /^Form: Contact form\nPage: zanservices\.com\/contact-us\?utm_source=google\nService: Web Development\n\nMessage:\nWe need a website\.$/)
    assert.equal(String(saved.lastInteractionId), String(notes[0]._id))
})

test("only the lead's own region is told about it", async () => {
    const india = await User.create({ name: "India Rep", email: "in@team.test", password: "x", role: 10, regions: ["IN"] })
    const uae = await User.create({ name: "UAE Rep", email: "ae@team.test", password: "x", role: 10, regions: ["AE"] })

    await call(postLead, lead())

    const sent = await Notification.find({ type: EVENT_CODE.LEAD_CREATED }).lean()
    assert.deepEqual(sent.map((n) => String(n.recipient)), [String(india._id)])
    assert.notEqual(String(sent[0].recipient), String(uae._id))
})

test("a second enquiry from the same phone adds a note to that lead and fills in its email", async () => {
    await call(postLead, lead({ email: null }))
    const res = await call(postLead, lead({ phone: "+91 98300 12345", email: "asha@company.in", message: "Any update?" }))
    assert.equal(res.status, 200)

    const leads = await allLeads()
    assert.equal(leads.length, 1)
    assert.equal(leads[0].email, "asha@company.in")

    const notes = await notesOf(leads[0]._id)
    assert.equal(notes.length, 2)
    assert.match(notes[1].description ?? "", /Message:\nAny update\?$/)
    assert.equal(String(leads[0].lastInteractionId), String(notes[1]._id))
})

test("a lead without a phone is refused, and nothing is saved", async () => {
    const res = await call(postLead, lead({ phone: null }))
    assert.equal(res.status, 400)
    assert.equal((await allLeads()).length, 0)
})

test("the same person by email, with another phone, gets a note that keeps the new number", async () => {
    await call(postLead, lead())
    await call(postLead, lead({ phone: "+91 98111 22333", email: "ASHA@company.in" }))

    const leads = await allLeads()
    assert.equal(leads.length, 1)
    assert.equal(leads[0].phone, "+919830012345")
    const notes = await notesOf(leads[0]._id)
    assert.equal(notes.length, 2)
    assert.match(notes[1].description ?? "", /\nPhone: \+91 98111 22333\n/)
})

test("a phone another region's lead already has: the enquiry goes on that lead, in its region", async () => {
    const uae = await call(
        postLead,
        lead({ source: "zanverse-technologies", region: "AE", form: "landing_page_form", phone: "050 123 4567", email: "omar@firm.ae", name: "Omar" }),
        { key: KEY.zanverse }
    )
    assert.equal(uae.status, 200)

    const india = await call(postLead, lead({ phone: "+971 50 123 4567", email: "omar@firm.in", name: "Omar" }))
    assert.equal(india.status, 200)

    // Lead.phone is unique across regions, so there is still one lead.
    const leads = await allLeads()
    assert.equal(leads.length, 1)
    assert.deepEqual([leads[0].region, leads[0].phone, leads[0].source], ["AE", "+971501234567", "zanversetechnologies.com"])

    const notes = await notesOf(leads[0]._id)
    assert.equal(notes.length, 2)
    assert.equal(notes[1].region, "AE")
    assert.equal(notes[1].title, "Enquiry from zanservices.com")
    assert.match(notes[1].description ?? "", /Region: sent from the India site\./)
    assert.match(notes[1].description ?? "", /Email: omar@firm\.in/)
})

test("a deleted lead with the same phone is brought back, with the enquiry on it", async () => {
    await call(postLead, lead())
    await withoutRegionScope(() => Lead.updateMany({}, { $set: { deletedAt: new Date() } }))

    const res = await call(postLead, lead({ message: "Back again." }))
    assert.equal(res.status, 200)

    const leads = await allLeads()
    assert.equal(leads.length, 1)
    assert.equal(leads[0].deletedAt, null)
    const notes = await notesOf(leads[0]._id)
    assert.equal(notes.length, 2)
    assert.match(notes[1].description ?? "", /This lead had been deleted\. This enquiry brought it back\./)
})

test("a phone that is not a valid number is saved as typed, and the note says so", async () => {
    await call(postLead, lead({ phone: "12345" }))
    const [saved] = await allLeads()
    assert.equal(saved.phone, "12345")
    assert.match((await notesOf(saved._id))[0].description ?? "", /Phone: 12345 \(not a valid number, saved as typed\)/)
})

test("a chat lead's note carries what the assistant gathered", async () => {
    await call(
        postLead,
        lead({
            form: "chat_widget",
            page: null,
            // libphonenumber's own example number for the US.
            phone: "+1 201 555 0123",
            region: "US",
            service: null,
            message: "Call after 6pm",
            chat: {
                conversationId: "c-123",
                leadScore: "HIGH",
                service: "web_development",
                projectType: "E-commerce",
                budget: null,
                timeline: "2 months",
                requirements: ["payments", "inventory"],
                technology: [],
                summary: "Wants a shop.",
            },
        })
    )
    const [saved] = await allLeads()
    assert.equal(saved.region, "US")
    assert.equal(saved.phone, "+12015550123")
    assert.equal(
        (await notesOf(saved._id))[0].description,
        [
            "Form: Chat assistant",
            "Lead score: HIGH",
            "Service: web_development",
            "Project type: E-commerce",
            "Timeline: 2 months",
            "Requirements: payments, inventory",
            "Conversation: c-123",
            "",
            "Summary:",
            "Wants a shop.",
            "",
            "Message:",
            "Call after 6pm",
        ].join("\n")
    )
})

test("a retry with the same id saves once and gets the same answer", async () => {
    const body = lead()
    const first = await call(postLead, body, { headers: { "idempotency-key": body.id } })
    const second = await call(postLead, body, { headers: { "idempotency-key": body.id } })
    assert.deepEqual([first.status, second.status], [200, 200])
    assert.deepEqual(second.json, { success: true, status: "received" })

    const leads = await allLeads()
    assert.equal(leads.length, 1)
    assert.equal((await notesOf(leads[0]._id)).length, 1)
})

test("a request still being saved answers 409, and a stale claim is taken over", async () => {
    const body = lead()
    await IntegrationReceipt.create({ site: "zanservices", requestId: body.id, kind: "lead", state: "processing", claimedAt: new Date() })
    assert.equal((await call(postLead, body)).status, 409)
    assert.equal((await allLeads()).length, 0)

    await IntegrationReceipt.updateOne({ requestId: body.id }, { $set: { claimedAt: new Date(Date.now() - 120_000) } })
    assert.equal((await call(postLead, body)).status, 200)
    assert.equal((await allLeads()).length, 1)
    assert.equal((await IntegrationReceipt.findOne({ requestId: body.id }).lean())?.state, "done")
})

test("the key decides which website is calling, and what it may send", async () => {
    const statuses = {
        noKey: (await call(postLead, lead(), { key: null })).status,
        wrongKey: (await call(postLead, lead(), { key: "x".repeat(40) })).status,
        otherSite: (await call(postLead, lead(), { key: KEY.zanverse })).status,
        otherRegion: (await call(postLead, lead({ source: "zanverse-technologies", region: "IN" }), { key: KEY.zanverse })).status,
        browser: (await call(postLead, lead(), { headers: { origin: "https://zanservices.com" } })).status,
        notJson: (await call(postLead, "name=Asha", { headers: { "content-type": "text/plain" } })).status,
        badBody: (await call(postLead, lead({ name: "" }))).status,
        idMismatch: (await call(postLead, lead(), { headers: { "idempotency-key": "another-id-123" } })).status,
    }
    assert.deepEqual(statuses, {
        noKey: 401,
        wrongKey: 401,
        otherSite: 403,
        otherRegion: 403,
        browser: 403,
        notJson: 415,
        badBody: 400,
        idMismatch: 400,
    })
    assert.equal((await allLeads()).length, 0)
})

test("with no bot user set up, every call is refused before anything is saved", async () => {
    delete process.env.ZANSERVICES_USER_ID
    try {
        assert.equal((await call(postLead, lead())).status, 503)
        assert.equal((await call(postSignup, signup())).status, 503)
    } finally {
        process.env.ZANSERVICES_USER_ID = BOT
    }
    assert.equal((await allLeads()).length, 0)
    assert.equal((await allContacts()).length, 0)
})

test("with no key set up, every call is refused", async () => {
    const saved = { ...process.env }
    delete process.env.ZANSERVICES_SITE_API_KEY
    delete process.env.ZANVERSE_TECHNOLOGIES_SITE_API_KEY
    try {
        assert.equal((await call(postLead, lead())).status, 503)
    } finally {
        process.env.ZANSERVICES_SITE_API_KEY = saved.ZANSERVICES_SITE_API_KEY
        process.env.ZANVERSE_TECHNOLOGIES_SITE_API_KEY = saved.ZANVERSE_TECHNOLOGIES_SITE_API_KEY
    }
})

/* ── Newsletter ────────────────────────────────────────────────────────── */

test("a sign-up becomes a contact with the record of what the person agreed to", async () => {
    const res = await call(postSignup, signup())
    assert.deepEqual([res.status, res.json], [200, { success: true, status: "subscribed" }])

    const [contact] = await allContacts()
    assert.equal(contact.region, "IN")
    assert.equal(contact.email, "Reader@Company.in")
    assert.equal(contact.emailNormalized, "reader@company.in")
    assert.equal(contact.marketingConsent, true)
    assert.equal(contact.consentSource, "form:zanservices.com/newsletter_form")
    assert.equal(contact.consentText, "Yes, email me the newsletter.")
    assert.equal(contact.consentVersion, "2026-11-25")
    assert.equal(contact.consentPage, "zanservices.com/blog?utm_source=linkedin")
    assert.equal(contact.consentAt.toISOString(), "2026-11-26T10:00:00.000Z")
    assert.deepEqual(contact.tags, ["newsletter", "zanservices.com"])
    assert.equal(String(contact.createdBy), BOT)

    // No lead: a sign-up is not an enquiry.
    assert.equal((await allLeads()).length, 0)
})

test("a second sign-up updates the consent record and keeps one contact", async () => {
    await withoutRegionScope(() =>
        EmailContact.create({ region: "IN", email: "reader@company.in", emailNormalized: "reader@company.in", marketingConsent: false, tags: ["vip"] })
    )
    await call(postSignup, signup({ consent: { text: "New words.", version: "2026-12-01", at: "2026-12-01T09:00:00.000Z" } }))

    const contacts = await allContacts()
    assert.equal(contacts.length, 1)
    assert.equal(contacts[0].marketingConsent, true)
    assert.equal(contacts[0].consentVersion, "2026-12-01")
    assert.deepEqual(contacts[0].tags, ["vip", "newsletter", "zanservices.com"])
})

test("an address on the do-not-email list stays on it", async () => {
    await withoutRegionScope(() =>
        EmailSuppression.create({ region: "IN", email: "reader@company.in", emailNormalized: "reader@company.in", reason: SUPPRESSION_REASON.UNSUBSCRIBED })
    )
    const res = await call(postSignup, signup())
    // The same answer as any sign-up, so it does not say who unsubscribed.
    assert.deepEqual(res.json, { success: true, status: "subscribed" })
    assert.equal((await allContacts()).length, 0)
})

test("a contact an admin deleted is restored with the new consent", async () => {
    await withoutRegionScope(() =>
        EmailContact.create({ region: "IN", email: "reader@company.in", emailNormalized: "reader@company.in", marketingConsent: false, deletedAt: new Date() })
    )
    await call(postSignup, signup())

    const [contact] = await allContacts()
    assert.equal(contact.deletedAt, null)
    assert.equal(contact.marketingConsent, true)
})

test("test and throwaway domains are not stored, and the same address is one contact per region", async () => {
    await call(postSignup, signup({ email: "someone@example.com" }))
    assert.equal((await allContacts()).length, 0)

    await call(postSignup, signup({ region: "IN" }))
    await call(postSignup, signup({ region: "US" }))
    await call(
        postSignup,
        signup({ source: "zanverse-technologies", region: "AE" }),
        { key: KEY.zanverse }
    )

    const contacts = await allContacts()
    assert.deepEqual(contacts.map((c) => c.region).sort(), ["AE", "IN", "US"])
    const uae = contacts.find((c) => c.region === "AE")!
    assert.equal(uae.consentSource, "form:zanversetechnologies.com/newsletter_form")
    assert.deepEqual(uae.tags, ["newsletter", "zanversetechnologies.com"])
})
