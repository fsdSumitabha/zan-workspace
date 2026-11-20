import test, { before } from "node:test"
import assert from "node:assert/strict"

import {
    decodeTarget,
    encodeTarget,
    hashIp,
    signTarget,
    trackingReady,
    verifyTarget,
} from "./token"

/**
 * The signature is what stops a real tracking link being edited into a
 * redirect to somebody else's site. The allow-list in the click route is
 * the larger guard, but this is the first one.
 */

const TOKEN = "a".repeat(32)
const TARGET = "https://zanservices.com/offer?id=7"

before(() => {
    process.env.EMAIL_TRACKING_SECRET ??= "test-tracking-secret-long-enough"
})

test("a signature verifies against the same token and target", () => {
    const signature = signTarget(TOKEN, TARGET)

    assert.ok(signature)
    assert.equal(verifyTarget(TOKEN, TARGET, signature!), true)
})

test("a changed destination fails", () => {
    // The attack this exists for: take a real link from an email, swap the
    // destination for your own site, send it on.
    const signature = signTarget(TOKEN, TARGET)!

    assert.equal(
        verifyTarget(TOKEN, "https://evil.example/steal", signature),
        false
    )
})

test("another recipient's signature fails", () => {
    const signature = signTarget(TOKEN, TARGET)!
    const other = "b".repeat(32)

    assert.equal(verifyTarget(other, TARGET, signature), false)
})

test("an empty or malformed signature fails rather than throwing", () => {
    assert.equal(verifyTarget(TOKEN, TARGET, ""), false)
    assert.equal(verifyTarget(TOKEN, TARGET, "short"), false)
    assert.equal(verifyTarget(TOKEN, TARGET, "!".repeat(16)), false)
})

test("the signature is short enough for a link but long enough to matter", () => {
    const signature = signTarget(TOKEN, TARGET)!

    assert.equal(signature.length, 16, "16 hex characters is 64 bits")
    assert.match(signature, /^[a-f0-9]+$/)
})

test("a target round-trips through base64url", () => {
    const awkward = "https://x.test/a b?q=1&r=2+3/4#frag"
    const encoded = encodeTarget(awkward)

    // No characters a mail client would mangle in a query string.
    assert.ok(!encoded.includes("+"))
    assert.ok(!encoded.includes("/"))
    assert.ok(!encoded.includes("="))

    assert.equal(decodeTarget(encoded), awkward)
})

test("rubbish does not decode into something usable", () => {
    assert.equal(decodeTarget(""), null)
    // Far longer than any legitimate destination.
    assert.equal(decodeTarget(encodeTarget("x".repeat(3_000))), null)
})

test("an IP is hashed, never kept", () => {
    const hash = hashIp("203.0.113.9")

    assert.ok(hash)
    assert.ok(!hash!.includes("203"))
    assert.equal(hash!.length, 32)

    // Stable, so two opens from one reader can be told apart from two
    // readers, without knowing where either of them is.
    assert.equal(hashIp("203.0.113.9"), hash)
    assert.notEqual(hashIp("203.0.113.10"), hash)
})

test("a missing IP gives nothing rather than a hash of nothing", () => {
    assert.equal(hashIp(null), undefined)
    assert.equal(hashIp(""), undefined)
})

test("tracking reports itself ready when a secret is set", () => {
    assert.equal(trackingReady(), true)
})
