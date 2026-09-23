/**
 * Step 3 of 11. Puts every lead phone number into E.164 form, "+91XXXXXXXXXX".
 *
 *   npx tsx src/scripts/region-migration/03-leads-phone.ts
 *   npx tsx src/scripts/region-migration/03-leads-phone.ts --apply
 *
 * Production stores bare ten digit strings like "9433101111". The app now
 * saves E.164 and reads with the region's country as the default, so old
 * rows still display correctly. This script makes the stored value match
 * what the app writes today.
 *
 * ## Lead.phone is UNIQUE
 *
 * `phone: { type: String, required: true, unique: true }` in src/models/Lead.ts.
 *
 * Two different strings can normalise to the same number. "9433101111" and
 * "+91 94331 01111" both become "+919433101111". Writing the second one
 * would hit the unique index and throw.
 *
 * So this script does a full collision check over every lead BEFORE it
 * writes anything. A number that would collide is skipped, both rows are
 * named in the report, and the rest still run. The write itself also catches
 * a duplicate key error, in case something changed underneath.
 *
 * ## Rows that fail validation
 *
 * They are left exactly as they are and listed in the report. Nothing is
 * guessed. Fix them by hand, then run this again.
 *
 * ## Why the parsing is copied instead of imported
 *
 * src/lib/phone.ts cannot be imported under tsx. Its static import of
 * libphonenumber-js loses the metadata through tsx's CommonJS interop and
 * throws "Cannot read properties of undefined". A dynamic import works, so
 * the accept path of validatePhone is reproduced below, character for
 * character, against the same library the app uses.
 *
 * If src/lib/phone.ts changes, change `normalise` here to match.
 */

import type { ObjectId } from "mongodb"
import { readArgs, connect, banner, Report, progress, done, crash } from "./_shared"

/** Copied from src/lib/phone.ts. Zero-width and text-direction marks. */
const HIDDEN_MARKS = /[​-‏‪-‮⁦-⁩﻿]/g

/** Copied from src/lib/phone.ts. "00" is the international prefix in IN and AE. */
function clean(input: string): string {
    return input.replace(HIDDEN_MARKS, "").trim().replace(/^00/, "+")
}

async function main() {
    const args = readArgs()
    const s = await connect()

    await banner("03 — Leads: phone to +91 E.164", s, args)

    // Dynamic import. A static one loses the metadata under tsx.
    const lib = await import("libphonenumber-js")
    const { DEFAULT_REGION, REGIONS } = await import("@/lib/region")
    const country = REGIONS[DEFAULT_REGION].phoneCountry

    console.log(`  default country for bare numbers: ${country}`)

    /** The accept path of validatePhone, same library, same options. */
    function normalise(raw: unknown): { ok: true; e164: string } | { ok: false; why: string } {
        if (typeof raw !== "string") return { ok: false, why: `not a string (${typeof raw})` }
        const cleaned = clean(raw)
        if (!cleaned) return { ok: false, why: "empty" }
        if (cleaned.length > 40) return { ok: false, why: "too long (over 40 chars)" }

        const phone = lib.parsePhoneNumberFromString(cleaned, {
            defaultCountry: country,
            extract: false,
        })

        if (!phone) return { ok: false, why: "could not be parsed" }
        if (phone.ext) return { ok: false, why: "has an extension" }
        if (!phone.isValid()) return { ok: false, why: "not a valid number for " + country }

        return { ok: true, e164: phone.number }
    }

    const rep = new Report()
    const col = s.db.collection("leads")

    const leads = await col
        .find({}, { projection: { _id: 1, phone: 1, deletedAt: 1 } })
        .toArray()

    console.log(`  leads in collection: ${leads.length}`)
    console.log("")

    /* ------------------------------------------------ pass 1: classify --- */

    type Plan = { id: string; _id: ObjectId; from: string; to: string; deleted: boolean }

    const plans: Plan[] = []
    /** E.164 values already sitting in the collection and not being changed. */
    const occupied = new Map<string, string>()

    for (const l of leads) {
        const id = String(l._id)
        const raw = l.phone

        // Already E.164 and valid. Leave it, but it occupies that number.
        if (typeof raw === "string" && raw.startsWith("+")) {
            const n = normalise(raw)
            if (n.ok && n.e164 === raw) {
                occupied.set(raw, id)
                rep.skip(id, `already E.164 ${raw}`)
                continue
            }
        }

        const n = normalise(raw)
        if (!n.ok) {
            rep.fail(id, `${JSON.stringify(raw)} — ${n.why}`)
            continue
        }

        if (typeof raw === "string" && n.e164 === raw) {
            occupied.set(raw, id)
            rep.skip(id, `already correct ${raw}`)
            continue
        }

        plans.push({ id, _id: l._id, from: String(raw), to: n.e164, deleted: !!l.deletedAt })
    }

    /* --------------------------------------- pass 2: collision check --- */

    const wanted = new Map<string, Plan[]>()
    for (const p of plans) {
        if (!wanted.has(p.to)) wanted.set(p.to, [])
        wanted.get(p.to)!.push(p)
    }

    const blocked = new Set<string>()

    for (const [num, group] of wanted) {
        // Two or more rows want the same number.
        if (group.length > 1) {
            for (const p of group) {
                blocked.add(p.id)
                rep.fail(p.id, `${p.from} -> ${num} collides with ${group.filter((g) => g.id !== p.id).map((g) => g.id).join(", ")}`)
            }
            continue
        }
        // One row wants a number another row already holds.
        const holder = occupied.get(num)
        if (holder) {
            blocked.add(group[0].id)
            rep.fail(group[0].id, `${group[0].from} -> ${num} already held by ${holder}`)
        }
    }

    const safe = plans.filter((p) => !blocked.has(p.id))
    const rows = args.limit ? safe.slice(0, args.limit) : safe

    console.log(`  already E.164 / correct : ${rep.skipped.length}`)
    console.log(`  cannot be parsed        : ${rep.failures.filter((f) => !f.reason.includes("collide") && !f.reason.includes("already held")).length}`)
    console.log(`  blocked by a collision  : ${blocked.size}`)
    console.log(`  safe to change          : ${safe.length}`)
    console.log("")

    if (rows.length === 0) {
        const code = rep.finish("03 leads phone", args.apply)
        await done(s, code)
    }

    /* ---------------------------------------------- pass 3: write --- */

    let n = 0
    for (const p of rows) {
        n++
        rep.examined++
        const tag = p.deleted ? " (soft-deleted)" : ""

        if (!args.apply) {
            rep.changed++
            progress(n, rows.length, `${p.id}  ${p.from.padEnd(14)} -> ${p.to}${tag}`)
            continue
        }

        try {
            const res = await col.updateOne({ _id: p._id }, { $set: { phone: p.to } })
            if (res.matchedCount !== 1) {
                rep.fail(p.id, "not matched on update")
                progress(n, rows.length, `${p.id} FAILED, not matched`)
                continue
            }
            rep.changed++
            progress(n, rows.length, `${p.id}  ${p.from.padEnd(14)} -> ${p.to}${tag}`)
        } catch (err) {
            const msg = (err as { code?: number; message?: string })
            const why =
                msg.code === 11000
                    ? `duplicate key, another lead already holds ${p.to}`
                    : String(msg.message)
            rep.fail(p.id, `${p.from} -> ${p.to} — ${why}`)
            progress(n, rows.length, `${p.id} FAILED — ${why}`)
        }
    }

    const code = rep.finish("03 leads phone", args.apply)
    await done(s, code)
}

main().catch(crash)
