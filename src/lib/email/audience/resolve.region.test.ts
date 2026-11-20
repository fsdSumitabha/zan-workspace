import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
    connectTestDb,
    disconnectTestDb,
    clearCollections,
    withoutRegionScope,
} from "@/lib/email/testing/db"
import Lead from "@/models/Lead"
import EmailContact from "@/models/EmailContact"
import { LEAD_STATUS } from "@/constants/leadStatus"
import { resolveAudience } from "./resolve"
import { previewAudience } from "./preview"

/**
 * An audience must never cross a region.
 *
 * These run inside `withoutRegionScope`, which is what the dispatcher does
 * when it builds a scheduled campaign's snapshot. With the region plugin
 * switched off, the only thing keeping an IN campaign away from AE people
 * is the region passed into resolveAudience. That is what is tested here.
 *
 * This was a real bug. resolve.ts relied on the plugin alone, and said so
 * in a comment, which is true in a request and false in the dispatcher.
 */

const ALL_LEADS = { leads: { all: true } }

before(async () => {
    await connectTestDb()
})

after(async () => {
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(async () => {
        await clearCollections([Lead, EmailContact])

        await Lead.insertMany([
            lead("IN", "in-one"),
            lead("IN", "in-two"),
            lead("AE", "ae-one"),
            lead("AE", "ae-two"),
        ])

        await EmailContact.insertMany([
            contact("IN", "contact-in"),
            contact("AE", "contact-ae"),
        ])
    })
})

function lead(region: string, slug: string) {
    return {
        region,
        name: slug,
        email: `${slug}@example.invalid`,
        // Unique index on phone, so every seeded lead needs its own.
        phone: `+99${slug.length}${Math.random().toString().slice(2, 10)}`,
        source: "test",
        status: LEAD_STATUS.NEW,
    }
}

function contact(region: string, slug: string) {
    return {
        region,
        email: `${slug}@example.invalid`,
        emailNormalized: `${slug}@example.invalid`,
        firstName: slug,
        marketingConsent: true,
    }
}

test("a region keeps the other region's leads out", async () => {
    const resolved = await withoutRegionScope(() =>
        resolveAudience(ALL_LEADS, { region: "IN" })
    )

    assert.equal(resolved.candidates.length, 2)
    assert.deepEqual(
        resolved.candidates.map((c) => c.email).sort(),
        ["in-one@example.invalid", "in-two@example.invalid"]
    )
})

test("the other region gets its own leads, not both", async () => {
    const resolved = await withoutRegionScope(() =>
        resolveAudience(ALL_LEADS, { region: "AE" })
    )

    assert.equal(resolved.candidates.length, 2)
    assert.ok(resolved.candidates.every((c) => c.email.startsWith("ae-")))
})

test("without a region, nothing holds the regions apart", async () => {
    // Not a feature. This is the state the dispatcher was in, and it is
    // pinned here so that removing the region argument fails loudly
    // rather than quietly emailing another region's customers.
    const resolved = await withoutRegionScope(() => resolveAudience(ALL_LEADS))

    assert.equal(resolved.candidates.length, 4)
})

test("contacts are held to the region too", async () => {
    const resolved = await withoutRegionScope(() =>
        resolveAudience({ contacts: { all: true } }, { region: "IN" })
    )

    assert.equal(resolved.candidates.length, 1)
    assert.equal(resolved.candidates[0].email, "contact-in@example.invalid")
})

test("the preview counts the same people the snapshot would write", async () => {
    // The preview and the snapshot both go through previewAudience and
    // resolveEligibleRecipients. If they ever disagree, the count someone
    // approved is not the number that gets an email.
    const preview = await withoutRegionScope(() =>
        previewAudience(ALL_LEADS, { region: "IN" })
    )

    assert.equal(preview.matched.leads, 2)
    assert.equal(preview.eligibleTotal, 2)
})
