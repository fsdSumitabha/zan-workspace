/**
 * The body every record script shares: give rows a `region` string.
 *
 * Only rows where `region` is missing, null, or an empty string are touched.
 * A row that already carries a region is never overwritten, so this is safe
 * to run twice, and safe to run after some rows already hold "US".
 *
 * Soft-deleted rows are included on purpose. A deleted lead still holds its
 * phone number in the unique index, and an admin restoring it later needs it
 * to be visible.
 */

import { readArgs, connect, banner, Report, progress, done, type Args, type Session } from "./_shared"

export interface SetRegionOptions {
    /** Mongo collection name, exactly as mongodump wrote it. */
    collection: string
    /** Shown in the banner, for example "02 — Leads: set region". */
    title: string
    /** Shown in the final result line. */
    label: string
    /** Which region to write. Defaults to DEFAULT_REGION from the app. */
    region?: string
}

/** Rows that still need a region. */
const NEEDS_REGION = {
    $or: [{ region: { $exists: false } }, { region: null }, { region: "" }],
}

export async function runSetRegion(opts: SetRegionOptions): Promise<void> {
    const args: Args = readArgs()
    const s: Session = await connect()

    await banner(opts.title, s, args)

    const { REGION_CODES, DEFAULT_REGION } = await import("@/lib/region")
    const region = opts.region ?? DEFAULT_REGION

    if (!(REGION_CODES as readonly string[]).includes(region)) {
        console.error(`  "${region}" is not a valid region. Valid: ${REGION_CODES.join(", ")}`)
        await done(s, 1)
    }

    const rep = new Report()

    // The collection may not exist at all, which is fine. Calls, quotations
    // and documents are empty in production today.
    const exists = await s.db.listCollections({ name: opts.collection }).toArray()
    if (exists.length === 0) {
        console.log(`  Collection "${opts.collection}" does not exist. Nothing to do.`)
        const code = rep.finish(opts.label, args.apply)
        await done(s, code)
    }

    const col = s.db.collection(opts.collection)

    const total = await col.countDocuments({})
    const already = await col.countDocuments({ region: { $exists: true, $nin: [null, ""] } })

    console.log(`  rows in collection : ${total}`)
    console.log(`  already have region: ${already}`)

    const todo = await col
        .find(NEEDS_REGION, { projection: { _id: 1, deletedAt: 1 } })
        .toArray()

    const rows = args.limit ? todo.slice(0, args.limit) : todo
    console.log(`  need a region      : ${todo.length}`)
    console.log("")

    if (rows.length === 0) {
        const code = rep.finish(opts.label, args.apply)
        await done(s, code)
    }

    let n = 0
    for (const doc of rows) {
        n++
        rep.examined++
        const id = String(doc._id)
        const tag = doc.deletedAt ? " (soft-deleted)" : ""

        if (!args.apply) {
            rep.changed++
            progress(n, rows.length, `${id} -> ${region}${tag}`)
            continue
        }

        try {
            // $set only. _id is never in the update document.
            const res = await col.updateOne({ _id: doc._id }, { $set: { region } })
            if (res.matchedCount !== 1) {
                rep.fail(id, "not matched on update")
                progress(n, rows.length, `${id} FAILED, not matched`)
                continue
            }
            rep.changed++
            progress(n, rows.length, `${id} -> ${region}${tag}`)
        } catch (err) {
            rep.fail(id, (err as Error).message)
            progress(n, rows.length, `${id} FAILED`)
        }
    }

    if (args.apply) {
        const left = await col.countDocuments(NEEDS_REGION)
        console.log("")
        console.log(`  rows still without a region: ${left}`)
        if (left > 0) {
            rep.fail("(collection)", `${left} row(s) still have no region`)
        }
    }

    const code = rep.finish(opts.label, args.apply)
    await done(s, code)
}
