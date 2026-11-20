import test from "node:test"
import assert from "node:assert/strict"

import { quotationMailTemplate } from "./quotationMailTemplate"

/**
 * This email goes to a customer, so two things have to be right: the money,
 * and never claiming something that is not true.
 *
 * The figures are the reason for the first. A quotation that says the wrong
 * total is worse than one that never arrives, because nobody notices until
 * the invoice.
 */

const BASE = {
    recipientName: "Asha Mehta",
    title: "Website rebuild",
    amount: 100_000,
    gstPercentage: 18,
}

test("the total is the amount plus GST", () => {
    const mail = quotationMailTemplate(BASE)

    assert.match(mail.html, /1,00,000\.00/)
    assert.match(mail.html, /18,000\.00/)
    assert.match(mail.html, /1,18,000\.00/)
    assert.match(mail.text, /Total payable: Rs 1,18,000\.00/)
})

test("a GST of zero is handled, not skipped", () => {
    // An export sale can genuinely be zero-rated. The row still has to
    // appear, because a client reading "Total payable" needs to see why it
    // equals the amount.
    const mail = quotationMailTemplate({ ...BASE, gstPercentage: 0 })

    assert.match(mail.html, /GST at 0%/)
    assert.match(mail.text, /GST at 0%:   Rs 0\.00/)
    assert.match(mail.text, /Total payable: Rs 1,00,000\.00/)
})

test("fractional money keeps both decimal places", () => {
    const mail = quotationMailTemplate({ ...BASE, amount: 1999.5, gstPercentage: 5 })

    // 1999.50 + 99.975 = 2099.475, which rounds for display only.
    assert.match(mail.text, /Amount:        Rs 1,999\.50/)
    assert.match(mail.text, /Rs 99\.98/)
    assert.match(mail.text, /Total payable: Rs 2,099\.48/)
})

test("the subject carries the title when there is one", () => {
    assert.equal(
        quotationMailTemplate(BASE).subject,
        "Quotation: Website rebuild — Zan Services"
    )
})

test("a missing title falls back rather than leaving a gap", () => {
    const mail = quotationMailTemplate({ ...BASE, title: "   " })

    assert.equal(mail.subject, "Your quotation from Zan Services")
    assert.match(mail.html, /Your quotation/)
})

test("the attachment is only mentioned when it is really attached", () => {
    const attached = quotationMailTemplate({
        ...BASE,
        fileUrl: "https://ik.imagekit.io/x/quotations/q.pdf",
        attached: true,
    })
    assert.match(attached.html, /attached to this email/)

    const linkOnly = quotationMailTemplate({
        ...BASE,
        fileUrl: "https://ik.imagekit.io/x/quotations/q.pdf",
        attached: false,
    })
    assert.doesNotMatch(linkOnly.html, /attached to this email/)
    assert.match(linkOnly.html, /available at the link below/)

    // No file at all: neither sentence, and no empty button.
    const noFile = quotationMailTemplate(BASE)
    assert.doesNotMatch(noFile.html, /attached to this email/)
    assert.doesNotMatch(noFile.html, /available at the link below/)
    assert.doesNotMatch(noFile.html, /View the full quotation/)
})

test("the file link is in the email when there is a file", () => {
    const url = "https://ik.imagekit.io/x/quotations/1764-proposal.pdf"
    const mail = quotationMailTemplate({ ...BASE, fileUrl: url, attached: true })

    assert.match(mail.html, /View the full quotation/)
    assert.ok(mail.html.includes(url))
    assert.ok(mail.text.includes(url))
})

test("a typed name cannot inject markup", () => {
    // Names, titles and descriptions are typed by a person. An unescaped
    // angle bracket would turn the rest of the email into markup.
    const mail = quotationMailTemplate({
        ...BASE,
        recipientName: '<script>alert("x")</script>',
        title: "Rebuild & relaunch",
        description: "Phase 1 <b>only</b>",
    })

    assert.doesNotMatch(mail.html, /<script>/)
    assert.match(mail.html, /&lt;script&gt;/)
    assert.match(mail.html, /Rebuild &amp; relaunch/)
    assert.match(mail.html, /&lt;b&gt;only&lt;\/b&gt;/)
})

test("the description appears only when there is one", () => {
    const withNote = quotationMailTemplate({ ...BASE, description: "Includes hosting." })
    assert.match(withNote.html, /Includes hosting\./)
    assert.match(withNote.text, /Includes hosting\./)

    const without = quotationMailTemplate({ ...BASE, description: "   " })
    assert.doesNotMatch(without.html, /white-space:pre-wrap/)
})

test("every message has both a text and an HTML part", () => {
    const mail = quotationMailTemplate(BASE)

    assert.ok(mail.text.length > 100)
    assert.match(mail.html, /^\s*<!DOCTYPE html>/)
    // The reply-to address a customer sees is sales, never HR.
    assert.match(mail.html, /sales@zanservices\.com/)
    assert.doesNotMatch(mail.html, /hr@/)
})
