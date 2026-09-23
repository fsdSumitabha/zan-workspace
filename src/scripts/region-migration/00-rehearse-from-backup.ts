/**
 * Step 0 of 11. Optional, but do it once before touching production.
 *
 *   npx tsx src/scripts/region-migration/00-rehearse-from-backup.ts <backup-dir>
 *
 * Copies a mongodump backup into a throwaway database on the same cluster,
 * called `zan_migration_rehearsal`. You can then run every script in this
 * folder against that copy with `--apply`, watch what happens, and check the
 * result, without production being involved at all.
 *
 * Example:
 *
 *   npx tsx src/scripts/region-migration/00-rehearse-from-backup.ts D:/Backups/actual/23092026/zanservices
 *
 *   # then point the scripts at the copy for one shell session
 *   export MONGODB_URI="<your uri with /zan_migration_rehearsal? in place of /zan_services?>"
 *   npx tsx src/scripts/region-migration/01-users.ts --apply
 *   ...
 *   npx tsx src/scripts/region-migration/11-verify.ts
 *
 * Drop the rehearsal database when you are finished with it. It holds a copy
 * of real customer data.
 *
 * This script only ever writes to `zan_migration_rehearsal`. It checks the
 * database name after connecting and refuses to continue if it is anything
 * else, so it cannot be pointed at production by accident.
 */

import { readFileSync, existsSync } from "fs"
import { deserialize } from "bson"

const TARGET_DB = "zan_migration_rehearsal"

const COLLECTIONS = [
    "leads", "clients", "projects", "interactions", "meetings",
    "calls", "quotations", "documents", "users",
]

function readDump(path: string): Record<string, unknown>[] {
    if (!existsSync(path)) return []
    const b = readFileSync(path)
    const out: Record<string, unknown>[] = []
    let o = 0
    while (o < b.length) {
        const size = b.readInt32LE(o)
        if (size <= 0 || o + size > b.length) break
        out.push(deserialize(b.subarray(o, o + size)) as Record<string, unknown>)
        o += size
    }
    return out
}

async function main() {
    const backup = process.argv[2]

    if (!backup) {
        console.error("Give the backup folder, the one holding leads.bson.")
        console.error("  npx tsx src/scripts/region-migration/00-rehearse-from-backup.ts <backup-dir>")
        process.exit(1)
    }

    if (!existsSync(`${backup}/leads.bson`)) {
        console.error(`No leads.bson in ${backup}. Is that the right folder?`)
        process.exit(1)
    }

    const { config } = await import("dotenv")
    config({ path: ".env.local" })
    config({ path: ".env" })

    const uri = process.env.MONGODB_URI
    if (!uri) {
        console.error("MONGODB_URI is not set.")
        process.exit(1)
    }

    // Swap whatever database the URI names for the rehearsal one.
    const target = uri.replace(/\/([^/?]+)\?/, `/${TARGET_DB}?`)

    const mongoose = (await import("mongoose")).default
    await mongoose.connect(target)
    const db = mongoose.connection.db!

    // The guard. Never write anywhere but the rehearsal database.
    if (db.databaseName !== TARGET_DB) {
        console.error(`Refusing to run. Expected "${TARGET_DB}", connected to "${db.databaseName}".`)
        await mongoose.disconnect()
        process.exit(1)
    }

    console.log("")
    console.log(`  source : ${backup}`)
    console.log(`  target : ${db.databaseName}  (this is emptied first)`)
    console.log("")

    for (const name of COLLECTIONS) {
        const docs = readDump(`${backup}/${name}.bson`)
        await db.collection(name).deleteMany({})
        if (docs.length === 0) {
            console.log(`  ${name.padEnd(14)} 0 docs`)
            continue
        }
        await db.collection(name).insertMany(docs as never[], { ordered: false })
        console.log(`  ${name.padEnd(14)} ${docs.length} docs loaded`)
    }

    // Lead.phone is unique in the real schema. Without this index the phone
    // script's collision handling would never be exercised.
    await db.collection("leads").createIndex({ phone: 1 }, { unique: true })
    console.log("\n  unique index on leads.phone created")

    console.log("")
    console.log("  Rehearsal database ready. Point MONGODB_URI at it, then run 01 to 11.")
    console.log("  Drop it when you are done. It holds real customer data.")
    console.log("")

    await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
