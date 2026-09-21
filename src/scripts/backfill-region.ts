// Gives every existing record a region, and every existing user a regions
// array. Run this once, before the region filter starts hiding things.
//
//   npm run db:backfill-region              # dry run, writes nothing
//   npm run db:backfill-region -- --apply
//   npm run db:backfill-region -- --apply --region IN
//
// Default region is IN, because everything that exists today belongs to the
// India team. See docs/region-rollout.md.
//
// Users are handled separately from records. A user holds an array, and which
// regions they hold depends on their role:
//
//   role 10  Admin            every region
//   role 65  US Sales Agent   US
//   role 69  US Leads Manager US
//   role 90  System user      every region (it ingests leads from anywhere)
//   everyone else             the default region
//
// Check that table against your real staff list before running with --apply.
// Getting it wrong is not dangerous, it just means somebody sees the wrong
// data until you fix their account.
//
// Three things this script does on purpose:
//
// 1. It writes through `Model.collection`, the raw driver, not through
//    Mongoose. Two hooks would otherwise get in the way: the soft-delete
//    hook hides deleted rows, and regionScopePlugin would filter by a region
//    context that does not exist in a script. Deleted rows need a region too,
//    because they still hold their phone number in the unique index.
//
// 2. It only touches rows where the field is missing. Running it twice is
//    safe, and so is running it again after some rows already have a real
//    region.
//
// 3. It does not run the audit plugin. A backfill is not a user action, so
//    hundreds of ActivityLog rows with a null actor would be noise.
//
// Run `npm run db:indexes` afterwards to build the new region indexes.

import { config } from "dotenv"

// Same order as Next.js: .env.local wins over .env.
config({ path: ".env.local" })
config({ path: ".env" })

/** Models that hold a single `region` string. */
const RECORD_MODELS = [
    "Lead",
    "Client",
    "Project",
    "Interaction",
    "Meeting",
    "Call",
    "Quotation",
    "Document",
] as const

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

    // Importing the models registers them on the mongoose singleton.
    await import("@/models/User")
    for (const name of RECORD_MODELS) {
        await import(`@/models/${name === "Document" ? "Document" : name}`)
    }

    await dbConnect()

    console.log("Database:", mongoose.connection.db?.databaseName)
    console.log("Default region:", region)
    console.log("Mode:", apply ? "APPLY (writes)" : "DRY RUN (no writes)")
    console.log("")

    let pendingTotal = 0

    // ---------------------------------------------------------- records ---
    console.log("Records")
    console.log("-".repeat(58))

    for (const name of RECORD_MODELS) {
        const model = mongoose.models[name]
        if (!model) {
            console.log(`${name.padEnd(14)} model not registered, skipped`)
            continue
        }

        const col = model.collection
        const missing = { region: { $exists: false } }

        const total = await col.countDocuments({})
        const todo = await col.countDocuments(missing)
        pendingTotal += todo

        if (todo === 0) {
            console.log(`${name.padEnd(14)} ${String(total).padStart(6)} rows, all set`)
            continue
        }

        if (!apply) {
            console.log(
                `${name.padEnd(14)} ${String(total).padStart(6)} rows, ` +
                `${todo} would get "${region}"`
            )
            continue
        }

        const res = await col.updateMany(missing, { $set: { region } })
        const left = await col.countDocuments(missing)
        console.log(
            `${name.padEnd(14)} ${String(total).padStart(6)} rows, ` +
            `set ${res.modifiedCount}, ${left} left`
        )
    }

    // ------------------------------------------------------------ users ---
    console.log("")
    console.log("Users")
    console.log("-".repeat(58))

    const User = mongoose.models.User
    const userCol = User.collection
    const usersMissing = {
        $or: [{ regions: { $exists: false } }, { regions: { $size: 0 } }],
    }

    const allRegions = [...REGION_CODES]

    /** Role to regions. See the table at the top of this file. */
    function regionsForRole(role: number): string[] {
        if (role === 10 || role === 90) return allRegions
        if (role === 65 || role === 69) return ["US"]
        return [region]
    }

    const todoUsers = await userCol
        .find(usersMissing, { projection: { _id: 1, name: 1, email: 1, role: 1 } })
        .toArray()

    pendingTotal += todoUsers.length

    const totalUsers = await userCol.countDocuments({})
    console.log(`${totalUsers} user(s) total, ${todoUsers.length} with no regions`)

    if (todoUsers.length > 0) {
        console.log("")
        for (const u of todoUsers) {
            const regions = regionsForRole(u.role as number)
            const label = `${String(u.name ?? "?")} <${String(u.email ?? "?")}>`
            console.log(
                `  role ${String(u.role).padStart(2)}  ` +
                `${label.padEnd(40)} -> [${regions.join(", ")}]`
            )
        }

        if (apply) {
            let updated = 0
            for (const u of todoUsers) {
                const res = await userCol.updateOne(
                    { _id: u._id },
                    { $set: { regions: regionsForRole(u.role as number) } }
                )
                updated += res.modifiedCount
            }
            const left = await userCol.countDocuments(usersMissing)
            console.log(`\nSet regions on ${updated} user(s), ${left} left.`)

            if (left > 0) {
                console.error("Some users were not updated. Run again.")
                await mongoose.disconnect()
                process.exit(1)
            }
        }
    }

    // ----------------------------------------------------------- finish ---
    console.log("")

    if (pendingTotal === 0) {
        console.log("Nothing to do. Everything already has a region.")
    } else if (!apply) {
        console.log(`Dry run. ${pendingTotal} row(s) would change.`)
        console.log("Check the user table above, then re-run with --apply.")
    } else {
        console.log("Done. Next: npm run db:indexes")
    }

    await mongoose.disconnect()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
