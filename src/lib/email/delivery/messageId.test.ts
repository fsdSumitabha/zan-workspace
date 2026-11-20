import test from "node:test"
import assert from "node:assert/strict"

import { buildMessageId, parseMessageId, sendingDomainOf } from "./messageId"

const CAMPAIGN = "6afef4b47d5aee9cb49d9d26"
const RECIPIENT = "6afef4b47d5aee9cb49d9d27"

test("a message id round-trips back to its ids", () => {
    // This is the whole point: after a worker crash, the id on the
    // recipient row is the only handle on the message, and a webhook that
    // echoes it must map back without a lookup table.
    const id = buildMessageId({
        campaignId: CAMPAIGN,
        recipientId: RECIPIENT,
        attempt: 2,
        sendingDomain: "zanservices.com",
    })

    const parsed = parseMessageId(id)

    assert.deepEqual(parsed, {
        campaignId: CAMPAIGN,
        recipientId: RECIPIENT,
        attempt: 2,
    })
})

test("the same attempt always gives the same id", () => {
    const make = () =>
        buildMessageId({
            campaignId: CAMPAIGN,
            recipientId: RECIPIENT,
            attempt: 1,
            sendingDomain: "zanservices.com",
        })

    assert.equal(make(), make())
})

test("a retry is a different message", () => {
    const first = buildMessageId({
        campaignId: CAMPAIGN,
        recipientId: RECIPIENT,
        attempt: 1,
        sendingDomain: "zanservices.com",
    })
    const second = buildMessageId({
        campaignId: CAMPAIGN,
        recipientId: RECIPIENT,
        attempt: 2,
        sendingDomain: "zanservices.com",
    })

    assert.notEqual(first, second)
})

test("the id is a valid header value", () => {
    const id = buildMessageId({
        campaignId: CAMPAIGN,
        recipientId: RECIPIENT,
        attempt: 1,
        sendingDomain: "zanservices.com",
    })

    assert.ok(id.startsWith("<") && id.endsWith(">"))
    // A space or a newline here would be header injection.
    assert.ok(!/[\s<>]/.test(id.slice(1, -1)))
})

test("a hostile domain cannot inject into the header", () => {
    const id = buildMessageId({
        campaignId: CAMPAIGN,
        recipientId: RECIPIENT,
        attempt: 1,
        sendingDomain: "evil.com>\r\nBcc: victim@example.com",
    })

    assert.ok(!id.includes("\r"))
    assert.ok(!id.includes("\n"))
    assert.ok(!id.includes(" "))
    assert.equal(id.split("@")[1], "evil.combccvictimexample.com>")
})

test("a provider's own message id is not ours", () => {
    assert.equal(parseMessageId("<CAEx1234@mail.gmail.com>"), null)
    assert.equal(parseMessageId(""), null)
    assert.equal(parseMessageId(undefined), null)
    assert.equal(parseMessageId("not an id at all"), null)
})

test("the sending domain comes from the from address", () => {
    assert.equal(sendingDomainOf("news@zanservices.com"), "zanservices.com")
    assert.equal(sendingDomainOf("a@b@news.example.co.uk"), "news.example.co.uk")
})

test("a missing from address does not produce an empty domain", () => {
    // An empty domain in a Message-ID is a spam signal, so there has to be
    // something there.
    assert.equal(sendingDomainOf(undefined), "localhost")
    assert.equal(sendingDomainOf(""), "localhost")
    assert.equal(sendingDomainOf("no-at-sign"), "localhost")
})
