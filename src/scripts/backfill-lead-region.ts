// Gives every existing lead a region.
//
//   npm run db:backfill-lead-region           # dry run, writes nothing
//   npm run db:backfill-lead-region -- --apply
//   npm run db:backfill-lead-region -- --apply --region US
//
// Default region is IN, because every lead that exists today came from the
// India team. See docs/region-rollout.md.
//
// Three things this script does on purpose:
//
// 1. It writes through `Lead.collection`, the raw driver, not through
//    Mongoose. The `pre(/^find/)` hook on the Lead schema hides soft-deleted
//    rows. Deleted leads still hold their phone number in the unique index,
//    and `findLeadByPhone` reads them raw. If they had no region, the
//    region-aware conflict check would miss them later.
//
// 2. It only touches rows where `region` is missing. Running it twice is
//    safe. Running it after some leads already have a real region is safe.
//
// 3. It does not run the audit plugin. A backfill is not a user action, so
//    350 ActivityLog rows with a null actor would be noise. If you want the
//    change recorded, note it in docs/region-rollout.md instead.
//
// Run `npm run db:indexes` afterwards to build the new index on Lead.region.

import { config } from "dotenv"

// Same order as Next.js: .env.local wins over .env.
config({ path: ".env.local" })
config({ path: ".env" })

async function main() {
    const argv = process.argv.slice(2)
    const apply = argv.includes("--apply")

    const regionArg = argv.includes("--region")
        ? argv[argv.indexOf("--region") + 1]
        : undefined

    const { REGION_CODES, DEFAULT_REGION } = await import("@/lib/region")

    const region = regionArg ? regionArg.trim().toUpperCase() : DEFAULT_REGION

    if (!(REGION_CODES as readonly string[]).includes(region)) {
        console.error(
            `Unknown region "${region}". Valid codes: ${REGION_CODES.join(", ")}`
        )
        process.exit(1)
    }

    const dbConnect = (await import("@/lib/db/dbConnect")).default
    const mongoose = (await import("mongoose")).default
    const Lead = (await import("@/models/Lead")).default

    await dbConnect()

    const db = mongoose.connection.db
    console.log("Database:", db?.databaseName)
    console.log("Region to set:", region)
    console.log("Mode:", apply ? "APPLY (writes)" : "DRY RUN (no writes)")
    console.log("")

    const col = Lead.collection
    const missing = { region: { $exists: false } }

    const total = await col.countDocuments({})
    const toUpdate = await col.countDocuments(missing)
    const deletedToUpdate = await col.countDocuments({
        ...missing,
        deletedAt: { $ne: null },
    })

    console.log(`Leads in collection (deleted included): ${total}`)
    console.log(`Leads with no region:                   ${toUpdate}`)
    console.log(`  of those, soft-deleted:               ${deletedToUpdate}`)

    // Show what is already set, so a second run is easy to read.
    const existing = await col
        .aggregate([
            { $match: { region: { $exists: true } } },
            { $group: { _id: "$region", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ])
        .toArray()

    if (existing.length > 0) {
        console.log("\nAlready set:")
        for (const row of existing) {
            console.log(`  ${row._id}: ${row.count}`)
        }
    }

    if (toUpdate === 0) {
        console.log("\nNothing to do. Every lead already has a region.")
        await mongoose.disconnect()
        return
    }

    if (!apply) {
        console.log(
            `\nDry run. Would set region="${region}" on ${toUpdate} lead(s).`
        )
        console.log("Re-run with --apply to write.")
        await mongoose.disconnect()
        return
    }

    const result = await col.updateMany(missing, { $set: { region } })
    console.log(`\nMatched ${result.matchedCount}, modified ${result.modifiedCount}.`)

    const left = await col.countDocuments(missing)
    console.log(`Leads still with no region: ${left}`)

    if (left > 0) {
        console.error("\nSome rows were not updated. Run again.")
        await mongoose.disconnect()
        process.exit(1)
    }

    console.log("\nDone. Next: npm run db:indexes")
    await mongoose.disconnect()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
