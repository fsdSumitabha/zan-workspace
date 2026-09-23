/**
 * Step 1 of 11. Gives every user a `regions` array.
 *
 *   npx tsx src/scripts/region-migration/01-users.ts
 *   npx tsx src/scripts/region-migration/01-users.ts --apply
 *
 * Run this FIRST. Nobody can sign in and see anything until their account
 * holds at least one region. A user with no regions is denied every query by
 * regionScopePlugin, which looks like an empty database to the person.
 *
 * The rule, as agreed:
 *
 *   operations@zanservices.com   IN, US, AE     the admin, sees everything
 *   tech@zanservices.com         US             the US side
 *   everyone else                IN
 *
 * That includes support@zanservices.com, role 90, the API ingestion account.
 * It gets IN only, by decision.
 *
 *   Known consequence: a lead arriving through the public API or the Facebook
 *   webhook for any region other than IN will be refused, because
 *   resolveWriteRegion checks the acting account's regions. If US intake is
 *   ever switched on, give this account US as well.
 *
 * The two named accounts are always corrected, even if they already hold
 * something. Every other account is only filled in when it is empty, so a
 * change you make by hand later is not undone by re-running this.
 */

import { readArgs, connect, banner, Report, progress, done, crash } from "./_shared"

/** Exact addresses. Compared lower-case and trimmed. */
const ADMIN_EMAIL = "operations@zanservices.com"
const US_EMAIL = "tech@zanservices.com"

async function main() {
    const args = readArgs()
    const s = await connect()

    await banner("01 — Users: set the regions array", s, args)

    const { REGION_CODES, DEFAULT_REGION } = await import("@/lib/region")
    const ALL = [...REGION_CODES]
    const rep = new Report()

    const col = s.db.collection("users")

    // Every user, including soft-deleted ones. A deleted account that is
    // restored later still needs a region.
    const users = await col
        .find({}, { projection: { _id: 1, email: 1, role: 1, regions: 1, deletedAt: 1 } })
        .toArray()

    const rows = args.limit ? users.slice(0, args.limit) : users
    console.log(`  ${users.length} user(s) in the collection.\n`)

    let n = 0
    for (const u of rows) {
        n++
        rep.examined++

        const id = String(u._id)
        const email = String(u.email ?? "").trim().toLowerCase()
        const current: string[] = Array.isArray(u.regions) ? u.regions : []

        // What this account should hold.
        let want: string[]
        let why: string
        if (email === ADMIN_EMAIL) {
            want = ALL
            why = "admin, all regions"
        } else if (email === US_EMAIL) {
            want = ["US"]
            why = "US account"
        } else {
            want = [DEFAULT_REGION]
            why = `default ${DEFAULT_REGION}`
        }

        const isNamed = email === ADMIN_EMAIL || email === US_EMAIL
        const hasSome = current.length > 0
        const same =
            current.length === want.length &&
            want.every((r) => current.includes(r))

        // Already correct.
        if (same) {
            rep.skip(id, `${email} already [${current.join(", ")}]`)
            progress(n, rows.length, `${email.padEnd(36)} already [${current.join(", ")}]`)
            continue
        }

        // Someone else's account that already holds something. Leave it.
        if (hasSome && !isNamed) {
            rep.skip(id, `${email} holds [${current.join(", ")}], left alone`)
            progress(n, rows.length, `${email.padEnd(36)} holds [${current.join(", ")}] — left alone`)
            continue
        }

        const label = hasSome
            ? `[${current.join(", ")}] -> [${want.join(", ")}]`
            : `-> [${want.join(", ")}]`

        if (!args.apply) {
            rep.changed++
            progress(n, rows.length, `${email.padEnd(36)} ${label}  (${why})`)
            continue
        }

        try {
            const res = await col.updateOne({ _id: u._id }, { $set: { regions: want } })
            if (res.matchedCount !== 1) {
                rep.fail(id, `${email} not matched on update`)
                progress(n, rows.length, `${email.padEnd(36)} FAILED, not matched`)
                continue
            }
            rep.changed++
            progress(n, rows.length, `${email.padEnd(36)} ${label}  (${why})`)
        } catch (err) {
            rep.fail(id, `${email} ${(err as Error).message}`)
            progress(n, rows.length, `${email.padEnd(36)} FAILED`)
        }
    }

    // A user with no regions is locked out, so say so plainly.
    if (args.apply) {
        const stranded = await col.countDocuments({
            $or: [{ regions: { $exists: false } }, { regions: { $size: 0 } }],
        })
        console.log("")
        console.log(`  users still with no regions: ${stranded}`)
        if (stranded > 0) {
            rep.fail("(collection)", `${stranded} user(s) still have no regions — they cannot see any data`)
        }
    }

    const code = rep.finish("01 users", args.apply)
    await done(s, code)
}

main().catch(crash)
