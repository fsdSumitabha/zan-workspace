import test, { before } from "node:test"
import assert from "node:assert/strict"

import { injectTracking } from "./inject"
import { decodeTarget, verifyTarget } from "./token"

const TOKEN = "c".repeat(32)
const ORIGIN = "https://crm.example.test"

before(() => {
    process.env.EMAIL_TRACKING_SECRET ??= "test-tracking-secret-long-enough"
})

function inject(html: string, overrides: Partial<Parameters<typeof injectTracking>[0]> = {}) {
    return injectTracking({
        html,
        recipientToken: TOKEN,
        origin: ORIGIN,
        trackClicks: true,
        trackOpens: true,
        ...overrides,
    })
}

test("an ordinary link is rewritten and stays verifiable", () => {
    const result = inject(
        '<html><body><a href="https://zanservices.com/offer">Go</a></body></html>'
    )

    assert.ok(result.html.includes(`${ORIGIN}/api/e/c/${TOKEN}`))
    assert.deepEqual(result.links, ["https://zanservices.com/offer"])

    // Pull the pieces back out and check the signature holds.
    const match = result.html.match(/\/api\/e\/c\/[^"?]+\?u=([^&"]+)&s=([^"]+)/)
    assert.ok(match)

    const target = decodeTarget(match![1])
    assert.equal(target, "https://zanservices.com/offer")
    assert.equal(verifyTarget(TOKEN, target!, match![2]), true)
})

test("the open pixel goes just inside the body", () => {
    const result = inject("<html><body><p>Hi</p></body></html>")

    assert.ok(result.html.includes(`${ORIGIN}/api/e/o/${TOKEN}`))
    assert.ok(result.html.indexOf("<img") < result.html.indexOf("</body>"))
})

test("the unsubscribe link is never routed through the tracker", () => {
    // The one failure that turns into a spam complaint. It must not depend
    // on a redirect working.
    const result = inject(
        `<html><body><a href="${ORIGIN}/e/u/${TOKEN}">Unsubscribe</a></body></html>`
    )

    assert.ok(result.html.includes(`href="${ORIGIN}/e/u/${TOKEN}"`))
    assert.ok(!result.html.includes(`/api/e/c/${TOKEN}?u=`))
    assert.equal(result.links.length, 0)
})

test("mailto, tel and anchors are left alone", () => {
    const result = inject(
        '<body><a href="mailto:a@b.com">mail</a>' +
        '<a href="tel:+911234">call</a>' +
        '<a href="#top">top</a></body>'
    )

    assert.ok(result.html.includes('href="mailto:a@b.com"'))
    assert.ok(result.html.includes('href="tel:+911234"'))
    assert.ok(result.html.includes('href="#top"'))
    assert.equal(result.links.length, 0)
})

test("a link whose host is a merge token is left alone", () => {
    // It cannot be signed now, and the redirect would refuse it at read
    // time, which is worse for the reader than an untracked link.
    const result = inject('<body><a href="{{unsubscribe_url}}">x</a></body>')

    assert.ok(result.html.includes('href="{{unsubscribe_url}}"'))
    assert.equal(result.links.length, 0)
})

test("a relative or malformed href is left alone", () => {
    const result = inject(
        '<body><a href="/local">a</a><a href="not a url">b</a></body>'
    )

    assert.ok(result.html.includes('href="/local"'))
    assert.ok(result.html.includes('href="not a url"'))
    assert.equal(result.links.length, 0)
})

test("a javascript: href is not turned into a working link", () => {
    const result = inject('<body><a href="javascript:alert(1)">x</a></body>')

    assert.ok(!result.html.includes("/api/e/c/"))
    assert.equal(result.links.length, 0)
})

test("several links each get their own tracked URL", () => {
    const result = inject(
        '<body><a href="https://a.test/1">a</a><a href="https://b.test/2">b</a></body>'
    )

    assert.equal(result.links.length, 2)
    assert.equal((result.html.match(/\/api\/e\/c\//g) ?? []).length, 2)
})

test("tracking can be switched off completely", () => {
    const result = inject(
        '<html><body><a href="https://a.test/1">a</a></body></html>',
        { trackClicks: false, trackOpens: false }
    )

    assert.ok(result.html.includes('href="https://a.test/1"'))
    assert.ok(!result.html.includes("/api/e/o/"))
    assert.equal(result.links.length, 0)
})

test("clicks and opens can be switched off separately", () => {
    const noOpens = inject('<body><a href="https://a.test/1">a</a></body>', {
        trackOpens: false,
    })
    assert.ok(noOpens.html.includes("/api/e/c/"))
    assert.ok(!noOpens.html.includes("/api/e/o/"))

    const noClicks = inject('<body><a href="https://a.test/1">a</a></body>', {
        trackClicks: false,
    })
    assert.ok(!noClicks.html.includes("/api/e/c/"))
    assert.ok(noClicks.html.includes("/api/e/o/"))
})

test("a body with no closing tag still gets the pixel", () => {
    const result = inject("<p>Just a fragment</p>")
    assert.ok(result.html.includes("/api/e/o/"))
})
