import "../ad-tracking/testing/tsxPhoneFix"
import test from "node:test"
import assert from "node:assert/strict"

import { leadSchema, newsletterSchema, parseContract, type LeadBody } from "./contract"
import { siteForKey } from "./auth"
import { IntegrationError } from "./http"
import { enquiryNote } from "./enquiryNote"
import { INTEGRATION_SITES } from "./sites"

/**
 * The contract and the key check, with no database. Run with `npm test`.
 * The routes themselves are tested in integrations.test.ts.
 */

const ZANSERVICES = INTEGRATION_SITES.find((s) => s.id === "zanservices")!

const LEAD = {
    id: "3f6c2b1e-1111-4a2b-9c3d-123456789abc",
    source: "zanservices",
    sentAt: "2026-11-26T10:00:00.000Z",
    region: "IN",
    form: "contact_form",
    page: "zanservices.com/contact-us?from=%2Fweb",
    name: "  Asha   Rao ",
    email: " Asha@Company.IN ",
    phone: "+91 98300 12345",
    service: "Web Development",
    message: "Line one.\r\n\r\n\r\n\r\nLine two.",
}

function parseLead(over: Record<string, unknown> = {}): LeadBody {
    return parseContract(leadSchema, { ...LEAD, ...over })
}

function problemsOf(fn: () => unknown): string[] {
    try {
        fn()
    } catch (error) {
        assert.ok(error instanceof IntegrationError)
        assert.equal(error.status, 400)
        return (error.details ?? []).map((d) => `${d.field}: ${d.message}`)
    }
    assert.fail("expected the body to be refused")
}

test("a lead body is cleaned: one-line fields collapse, email is lower case, text keeps its lines", () => {
    const body = parseLead()
    assert.equal(body.name, "Asha Rao")
    assert.equal(body.email, "asha@company.in")
    assert.equal(body.message, "Line one.\n\nLine two.")
    assert.equal(body.interest, null)
    assert.equal(body.chat, null)
})

test("empty optional fields become null, and every lead needs a phone", () => {
    const body = parseLead({ email: "", service: "   ", page: null })
    assert.equal(body.email, null)
    assert.equal(body.service, null)
    assert.equal(body.page, null)

    assert.deepEqual(problemsOf(() => parseLead({ phone: "  " })), ["phone: phone is required"])
    assert.deepEqual(problemsOf(() => parseLead({ phone: null })), ["phone: Invalid input: expected string, received null"])
})

test("long free text is cut, not refused", () => {
    const body = parseLead({ message: "x".repeat(6000), page: `zanservices.com/?q=${"y".repeat(600)}` })
    assert.equal(body.message?.length, 5000)
    assert.equal(body.page?.length, 500)
})

test("identifiers, region and dates are checked strictly", () => {
    const problems = problemsOf(() =>
        parseLead({ id: "short", region: "in", form: "Contact Form", sentAt: "yesterday", name: " " })
    )
    assert.deepEqual(
        problems.map((p) => p.split(":")[0]),
        ["id", "sentAt", "region", "form", "name"]
    )
    assert.deepEqual(problemsOf(() => parseLead({ email: "not-an-address" })), ["email: email is not a valid address"])
})

test("a newsletter body needs the consent record", () => {
    const body = parseContract(newsletterSchema, {
        ...LEAD,
        form: "newsletter_form",
        email: "reader@company.in",
        consent: { text: " I agree. ", version: "2026-11-25", at: "2026-11-26T10:00:00+05:30" },
    })
    assert.equal(body.consent.text, "I agree.")

    const problems = problemsOf(() =>
        parseContract(newsletterSchema, { ...LEAD, email: "reader@company.in", consent: { text: "", version: "" } })
    )
    assert.deepEqual(problems.sort(), [
        "consent.at: Invalid input: expected string, received undefined",
        "consent.text: consent.text is required",
        "consent.version: consent.version is required",
    ])
})

test("the key decides the website", () => {
    const env = {
        ZANSERVICES_SITE_API_KEY: "s".repeat(40),
        ZANVERSE_TECHNOLOGIES_SITE_API_KEY: "v".repeat(40),
    }
    assert.equal(siteForKey("s".repeat(40), env)?.id, "zanservices")
    assert.equal(siteForKey("v".repeat(40), env)?.id, "zanverse-technologies")
    assert.equal(siteForKey("x".repeat(40), env), null)
    assert.equal(siteForKey("", env), null)
})

test("a short key is not a key, and two websites may not share one", () => {
    const short = { ZANSERVICES_SITE_API_KEY: "s".repeat(31) }
    assert.throws(() => siteForKey("s".repeat(31), short), (e: IntegrationError) => e.status === 503)

    const shared = { ZANSERVICES_SITE_API_KEY: "k".repeat(40), ZANVERSE_TECHNOLOGIES_SITE_API_KEY: "k".repeat(40) }
    assert.throws(() => siteForKey("k".repeat(40), shared), (e: IntegrationError) => e.status === 503)

    // One website set up is enough for that website to call.
    const one = { ZANSERVICES_SITE_API_KEY: "s".repeat(40) }
    assert.equal(siteForKey("s".repeat(40), one)?.id, "zanservices")
})

test("a new lead's note lists what the person sent", () => {
    const body = parseLead({ interest: "Growth package" })
    const note = enquiryNote(ZANSERVICES, body, {
        phone: { value: "+919830012345", valid: true },
        country: "IN",
        existing: null,
    })

    assert.equal(note.title, "Enquiry from zanservices.com")
    assert.equal(
        note.description,
        [
            "Form: Contact form",
            "Page: zanservices.com/contact-us?from=%2Fweb",
            "Service: Web Development",
            "Package: Growth package",
            "",
            "Message:",
            "Line one.\n\nLine two.",
        ].join("\n")
    )
})

test("on an existing lead, the note repeats only the details that differ", () => {
    const body = parseLead({ name: "Asha R", email: "asha.new@company.in", message: null, service: null })
    const existing = { _id: undefined as never, name: "Asha Rao", email: "asha@company.in", phone: "+919830099999" }

    // Found by phone: the phone is the lead's own, so it is not repeated.
    const byPhone = enquiryNote(ZANSERVICES, body, {
        phone: { value: "+919830099999", valid: true },
        country: "IN",
        existing,
        matchedBy: "phone",
    })
    assert.equal(
        byPhone.description,
        ["Form: Contact form", "Page: zanservices.com/contact-us?from=%2Fweb", "Name: Asha R", "Email: asha.new@company.in"].join("\n")
    )

    // Found by email, with another phone: the new number is kept in the note.
    const byEmail = enquiryNote(ZANSERVICES, parseLead({ message: null, service: null }), {
        phone: { value: "+919830012345", valid: true },
        country: "IN",
        existing: { ...existing, email: "asha@company.in" },
        matchedBy: "email",
    })
    assert.match(byEmail.description, /\nPhone: \+91 98300 12345$/)
})

test("the note says when the lead is another region's, or was brought back", () => {
    const note = enquiryNote(ZANSERVICES, parseLead({ message: null, service: null, page: null }), {
        phone: { value: "+971501234567", valid: true },
        country: "IN",
        existing: { _id: undefined as never, name: "Asha Rao", email: "asha@company.in", phone: "+971501234567", region: "AE" },
        matchedBy: "phone",
        sentForRegion: "IN",
        restored: true,
    })
    assert.equal(
        note.description,
        [
            "Form: Contact form",
            "Region: sent from the India site. This lead already has the same phone number, so the enquiry is here.",
            "This lead had been deleted. This enquiry brought it back.",
        ].join("\n")
    )
})
