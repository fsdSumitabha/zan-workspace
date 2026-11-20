import test from "node:test"
import assert from "node:assert/strict"

import { filenameFromUrl } from "./quotationMail"

/**
 * The name the client sees on the attachment.
 *
 * Uploads are stored as `<timestamp>-<original name>`, so the stored name
 * is not the one to show anybody. A client should receive "proposal.pdf".
 */

test("the upload timestamp is dropped", () => {
    assert.equal(
        filenameFromUrl("https://ik.imagekit.io/x/quotations/1764123456789-proposal.pdf"),
        "proposal.pdf"
    )
})

test("a name that has no timestamp is left alone", () => {
    assert.equal(
        filenameFromUrl("https://ik.imagekit.io/x/quotations/proposal.pdf"),
        "proposal.pdf"
    )
})

test("a number that is part of the name is kept", () => {
    // Only a long run of digits is a timestamp. "2026-budget.pdf" is a name.
    assert.equal(
        filenameFromUrl("https://ik.imagekit.io/x/quotations/2026-budget.pdf"),
        "2026-budget.pdf"
    )
})

test("query strings and fragments are not part of the name", () => {
    assert.equal(
        filenameFromUrl("https://ik.imagekit.io/x/q/1764123456789-a.pdf?tr=w-200#page=2"),
        "a.pdf"
    )
})

test("percent-encoding is undone", () => {
    assert.equal(
        filenameFromUrl("https://ik.imagekit.io/x/q/1764123456789-my%20quote.pdf"),
        "my quote.pdf"
    )
})

test("a URL with no usable name still produces one", () => {
    // Never return an empty filename: some clients show the attachment as
    // unopenable rather than guessing.
    assert.equal(filenameFromUrl("https://ik.imagekit.io/x/q/"), "quotation.pdf")
    assert.equal(
        filenameFromUrl("https://ik.imagekit.io/x/q/1764123456789-"),
        "quotation.pdf"
    )
})
