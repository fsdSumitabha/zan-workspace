/**
 * Step 11 of 11. Checks the migration worked. Read only, never writes.
 *
 *   npx tsx src/scripts/region-migration/11-verify.ts
 *
 * Run this after every other script. It re-reads production and answers one
 * question: is it now safe to deploy the region branch?
 *
 * It checks five things.
 *
 *   1. Every scoped record has a region. A record without one matches no
 *      region filter, so nobody, not even an admin, would ever see it again.
 *   2. Every user has at least one region. A user with none is locked out.
 *   3. The three named accounts hold what was agreed.
 *   4. Every lead phone is E.164.
 *   5. Every child record sits in the same region as its parent. A note on an
 *      India lead must be an India note.
 *
 * Exits 1 if anything is wrong, so it can gate a deploy.
 */

import { connect, banner, done, crash, readArgs } from "./_shared"

/** Collections that carry a single `region` string. */
const RECORD_COLLECTIONS = [
    "leads",
    "clients",
    "projects",
    "interactions",
    "meetings",
    "calls",
    "quotations",
    "documents",
] as const

/**
 * ActivityLog and Notification are deliberately absent. Neither model has a
 * region field and neither uses regionScopePlugin. See region-rollout.md
 * sections 3.3 and 3.4.
 */

const ADMIN_EMAIL = "operations@zanservices.com"
const US_EMAIL = "tech@zanservices.com"

async function main() {
    const args = readArgs()
    const s = await connect()

    await banner("11 — Verify (read only)", s, { ...args, apply: false })

    const { REGION_CODES } = await import("@/lib/region")
    const problems: string[] = []
    const ok = (t: string) => console.log(`  PASS  ${t}`)
    const bad = (t: string) => { console.log(`  FAIL  ${t}`); problems.push(t) }

    /* ------------------------------------- 1. records have a region --- */

    console.log("  1. Every record has a region")
    console.log("  " + "-".repeat(58))

    for (const name of RECORD_COLLECTIONS) {
        const exists = await s.db.listCollections({ name }).toArray()
        if (exists.length === 0) { ok(`${name.padEnd(14)} collection does not exist`); continue }

        const col = s.db.collection(name)
        const total = await col.countDocuments({})
        const missing = await col.countDocuments({
            $or: [{ region: { $exists: false } }, { region: null }, { region: "" }],
        })
        const wrong = await col.countDocuments({
            region: { $exists: true, $nin: [...REGION_CODES, null, ""] },
        })

        const spread: string[] = []
        for (const r of REGION_CODES) {
            const c = await col.countDocuments({ region: r })
            if (c > 0) spread.push(`${r}=${c}`)
        }

        if (missing > 0) bad(`${name.padEnd(14)} ${missing} of ${total} row(s) have NO region`)
        else if (wrong > 0) bad(`${name.padEnd(14)} ${wrong} row(s) have an unknown region code`)
        else ok(`${name.padEnd(14)} ${String(total).padStart(5)} rows  ${spread.join("  ") || "(empty)"}`)
    }

    /* --------------------------------------- 2 & 3. users --- */

    console.log("")
    console.log("  2. Every user has at least one region")
    console.log("  " + "-".repeat(58))

    const users = s.db.collection("users")
    const totalUsers = await users.countDocuments({})
    const noRegions = await users.countDocuments({
        $or: [{ regions: { $exists: false } }, { regions: { $size: 0 } }, { regions: null }],
    })

    if (noRegions > 0) {
        bad(`${noRegions} of ${totalUsers} user(s) have no regions — they are locked out`)
        const list = await users
            .find(
                { $or: [{ regions: { $exists: false } }, { regions: { $size: 0 } }, { regions: null }] },
                { projection: { email: 1, role: 1 } }
            )
            .toArray()
        for (const u of list) console.log(`        role ${u.role}  ${u.email}`)
    } else {
        ok(`all ${totalUsers} user(s) have at least one region`)
    }

    console.log("")
    console.log("  3. The named accounts hold what was agreed")
    console.log("  " + "-".repeat(58))

    async function checkUser(email: string, want: string[]) {
        const u = await users.findOne({ email }, { projection: { email: 1, role: 1, regions: 1 } })
        if (!u) { bad(`${email} not found`); return }
        const got: string[] = Array.isArray(u.regions) ? u.regions : []
        const same = got.length === want.length && want.every((r) => got.includes(r))
        if (same) ok(`${email.padEnd(34)} role ${String(u.role).padStart(2)}  [${got.join(", ")}]`)
        else bad(`${email} holds [${got.join(", ")}], expected [${want.join(", ")}]`)
    }

    await checkUser(ADMIN_EMAIL, [...REGION_CODES])
    await checkUser(US_EMAIL, ["US"])

    const others = await users
        .find({ email: { $nin: [ADMIN_EMAIL, US_EMAIL] } }, { projection: { email: 1, role: 1, regions: 1 } })
        .toArray()
    const strayOthers = others.filter((u) => {
        const g: string[] = Array.isArray(u.regions) ? u.regions : []
        return !(g.length === 1 && g[0] === "IN")
    })
    if (strayOthers.length === 0) ok(`the other ${others.length} account(s) all hold [IN]`)
    else {
        for (const u of strayOthers) {
            console.log(`  NOTE  ${String(u.email).padEnd(34)} holds [${(u.regions ?? []).join(", ")}] — check this is deliberate`)
        }
    }

    /* ------------------------------------------- 4. lead phones --- */

    console.log("")
    console.log("  4. Every lead phone is E.164")
    console.log("  " + "-".repeat(58))

    const leads = s.db.collection("leads")
    const leadTotal = await leads.countDocuments({})
    const notE164 = await leads
        .find({ phone: { $not: /^\+\d{6,15}$/ } }, { projection: { _id: 1, phone: 1 } })
        .toArray()

    if (notE164.length === 0) ok(`all ${leadTotal} lead phone(s) are E.164`)
    else {
        bad(`${notE164.length} of ${leadTotal} lead phone(s) are not E.164`)
        for (const l of notE164.slice(0, 20)) console.log(`        ${l._id}  ${JSON.stringify(l.phone)}`)
        if (notE164.length > 20) console.log(`        … and ${notE164.length - 20} more`)
    }

    /* ------------------------------ 5. children match their parent --- */

    console.log("")
    console.log("  5. Child records sit in their parent's region")
    console.log("  " + "-".repeat(58))

    const { ENTITY_TYPE } = await import("@/constants/entityTypes")
    const parentOf: Record<number, string> = {
        [ENTITY_TYPE.LEAD]: "leads",
        [ENTITY_TYPE.CLIENT]: "clients",
        [ENTITY_TYPE.PROJECT]: "projects",
    }

    for (const name of ["interactions", "meetings", "calls", "quotations"] as const) {
        const exists = await s.db.listCollections({ name }).toArray()
        if (exists.length === 0) { ok(`${name.padEnd(14)} collection does not exist`); continue }

        const col = s.db.collection(name)
        const rows = await col
            .find({}, { projection: { _id: 1, region: 1, entityType: 1, entityId: 1 } })
            .toArray()

        let mismatch = 0
        let unknownParent = 0

        for (const r of rows) {
            const pc = parentOf[Number(r.entityType)]
            if (!pc) { unknownParent++; continue }
            const parent = await s.db.collection(pc).findOne({ _id: r.entityId }, { projection: { region: 1 } })
            if (!parent) { unknownParent++; continue }
            if (parent.region !== r.region) {
                mismatch++
                if (mismatch <= 10) {
                    console.log(`        ${r._id}  is ${r.region}, parent ${pc} ${r.entityId} is ${parent.region}`)
                }
            }
        }

        if (mismatch > 0) bad(`${name.padEnd(14)} ${mismatch} row(s) differ from their parent`)
        else ok(`${name.padEnd(14)} ${String(rows.length).padStart(5)} rows match their parent` + (unknownParent ? `  (${unknownParent} parent not found)` : ""))
    }

    /* ----------------------------------------------- the verdict --- */

    console.log("")
    console.log("=".repeat(64))
    if (problems.length === 0) {
        console.log("  ALL CHECKS PASSED.")
        console.log("")
        console.log("  Production is ready for the region branch.")
        console.log("  Next: npm run db:indexes")
    } else {
        console.log(`  ${problems.length} CHECK(S) FAILED. Do not deploy yet.`)
        console.log("")
        for (const p of problems) console.log(`    - ${p}`)
    }
    console.log("=".repeat(64))

    await done(s, problems.length === 0 ? 0 : 1)
}

main().catch(crash)
