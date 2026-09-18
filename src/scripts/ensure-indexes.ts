// Builds every index that the Mongoose models declare, such as the unique
// index on Lead.phone. Run it after each deploy and after a collection is
// emptied or dropped:
//
//   npm run db:indexes
//
// Why: Mongoose builds indexes only when a model first loads, and not at
// all when `autoIndex` is off. If the leads collection is dropped while the
// server runs, the unique phone index is gone until the next restart, and
// two leads can get the same number.
//
// createIndexes() only adds missing indexes. It never drops one, unlike
// syncIndexes(). If rows already break a unique index, it fails and this
// script prints which index could not be built.

import { config } from "dotenv"

// Same order as Next.js: .env.local wins over .env.
config({ path: ".env.local" })
config({ path: ".env" })

async function main() {
    const dbConnect = (await import("@/lib/db/dbConnect")).default
    const mongoose = (await import("mongoose")).default

    await dbConnect()
    console.log("Database:", mongoose.connection.db?.databaseName)

    let failed = 0
    for (const name of mongoose.modelNames()) {
        const model = mongoose.model(name)
        try {
            await model.createIndexes()
            const indexes = await model.collection.indexes()
            console.log(`OK    ${name}: ${indexes.map((i) => i.name).join(", ")}`)
        } catch (err) {
            failed++
            console.error(`FAIL  ${name}: ${(err as Error).message}`)
        }
    }

    await mongoose.disconnect()
    if (failed) {
        console.error(`\n${failed} model(s) failed. Fix the duplicate rows named above, then run again.`)
        process.exit(1)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
