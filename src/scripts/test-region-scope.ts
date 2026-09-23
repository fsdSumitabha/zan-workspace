// Checks that the region filter actually filters.
//
//   npm run db:test-region-scope
//
// Read-only. It runs the same query under different region contexts and
// compares the counts against the raw driver. Run it after
// `npm run db:backfill-region -- --apply`.
//
// It covers the query kinds a `pre(/^find/)` hook does not reach, because
// those are the ones that leak: countDocuments and aggregate.
//
// Note on the baselines: softDeletePlugin hides deleted rows from find,
// countDocuments and aggregate alike. So every Mongoose count must equal the
// "not deleted" driver count. A mismatch means a list total will disagree
// with its rows again.

import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

interface Case {
    name: string
    run: () => Promise<number>
    want: number | ((n: number) => boolean)
    wantText: string
}

async function main() {
    const dbConnect = (await import("@/lib/db/dbConnect")).default
    const mongoose = (await import("mongoose")).default
    const Lead = (await import("@/models/Lead")).default
    const {
        runWithRegionContext,
        runWithoutRegionScope,
        beginRegionContext,
    } = await import("@/lib/region-scope")

    await dbConnect()
    console.log("Database:", mongoose.connection.db?.databaseName)

    // Ground truth, straight from the driver, past every hook.
    const col = Lead.collection
    const total = await col.countDocuments({})
    const inAll = await col.countDocuments({ region: "IN" })
    const usAll = await col.countDocuments({ region: "US" })
    const inLive = await col.countDocuments({ region: "IN", deletedAt: null })
    const usLive = await col.countDocuments({ region: "US", deletedAt: null })
    const allLive = await col.countDocuments({ deletedAt: null })

    console.log(
        `Raw driver: ${total} leads. ` +
        `IN=${inAll} (${inLive} not deleted), US=${usAll} (${usLive} not deleted).`
    )
    console.log("")

    const asIN = <T>(fn: () => Promise<T> | T) =>
        runWithRegionContext({ regions: ["IN"], writeRegion: "IN" }, fn)
    const asUS = <T>(fn: () => Promise<T> | T) =>
        runWithRegionContext({ regions: ["US"], writeRegion: "US" }, fn)
    const asAdmin = <T>(fn: () => Promise<T> | T) =>
        runWithRegionContext(
            { regions: ["IN", "US", "AE"], writeRegion: null },
            fn
        )

    const countAgg = async () => {
        const r = await Lead.aggregate([{ $count: "n" }])
        return (r[0]?.n as number) ?? 0
    }
    const countFind = async () => (await Lead.find({}).select("_id")).length

    const cases: Case[] = [
        // No context at all must deny everything.
        { name: "find, no context", run: countFind, want: 0, wantText: "0, deny by default" },
        { name: "countDocuments, no context", run: () => Lead.countDocuments({}), want: 0, wantText: "0, deny by default" },
        { name: "aggregate, no context", run: countAgg, want: 0, wantText: "0, deny by default" },

        // One region sees only its own rows.
        { name: "find as IN", run: () => asIN(countFind), want: inLive, wantText: `${inLive}, soft delete applies to find` },
        { name: "countDocuments as IN", run: () => asIN(() => Lead.countDocuments({})), want: inLive, wantText: `${inLive}, soft delete applies to count` },
        { name: "aggregate as IN", run: () => asIN(countAgg), want: inLive, wantText: `${inLive}, soft delete applies to aggregate` },

        // US sees its own rows and none of IN. Derived, not hardcoded: this
        // case said 0 while the US region was empty, and started failing the
        // moment somebody created a US lead. A test that encodes today's data
        // is a test that will lie to you later.
        { name: "find as US", run: () => asUS(countFind), want: usLive, wantText: `${usLive}` },
        { name: "countDocuments as US", run: () => asUS(() => Lead.countDocuments({})), want: usLive, wantText: `${usLive}` },

        // Admin holds every region, so it sees the sum.
        { name: "countDocuments as admin", run: () => asAdmin(() => Lead.countDocuments({})), want: inLive + usLive, wantText: `${inLive + usLive}` },
        { name: "find as admin", run: () => asAdmin(countFind), want: allLive, wantText: `${allLive}` },

        // The bypass really does bypass the region filter. It does not bypass
        // soft delete, which is a separate plugin.
        { name: "countDocuments, bypass", run: () => runWithoutRegionScope(() => Lead.countDocuments({})), want: allLive, wantText: `${allLive}` },

        // The lazy callback form must keep the context. A Mongoose query is
        // lazy, so a callback that returns one without awaiting used to leave
        // the context before the query ran. Everything was denied, including
        // the lookup of the signed-in user.
        { name: "lazy callback keeps context", run: () => asIN(() => Lead.countDocuments({})), want: inLive, wantText: `${inLive}` },
    ]

    // The one that matters most: requireAuth enters the context, awaits the
    // user lookup, then fills the regions in. AsyncLocalStorage.enterWith()
    // only reaches the caller while it runs inside the caller's synchronous
    // execution, so entering the store AFTER the await is invisible to the
    // route and every query is denied.
    //
    // That bug shipped once. Every other check in this file passed while the
    // whole app returned empty lists. Do not delete this case.
    async function mimicRequireAuth() {
        const store = beginRegionContext()          // before any await
        await Lead.collection.countDocuments({})    // the user lookup
        store.regions = ["IN"]                      // filled in after
        store.writeRegion = "IN"
    }

    async function viaRequireAuth() {
        await mimicRequireAuth()
        return Lead.countDocuments({})
    }

    cases.push({
        name: "context survives requireAuth",
        run: viaRequireAuth,
        want: inLive,
        wantText: `${inLive}, enterWith must happen before the await`,
    })

    let failed = 0

    for (const c of cases) {
        let got: number
        try {
            got = await c.run()
        } catch (err) {
            failed++
            console.log(`FAIL  ${c.name.padEnd(30)} threw: ${(err as Error).message}`)
            continue
        }
        const ok = typeof c.want === "function" ? c.want(got) : got === c.want
        if (!ok) failed++
        console.log(
            `${ok ? "OK  " : "FAIL"}  ${c.name.padEnd(30)} got ${String(got).padStart(4)}` +
            (ok ? "" : `   want ${c.wantText}`)
        )
    }

    console.log("")
    await mongoose.disconnect()

    if (failed > 0) {
        console.error(`${failed} check(s) failed. The region filter is not working.`)
        process.exit(1)
    }
    console.log("All checks passed.")
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
