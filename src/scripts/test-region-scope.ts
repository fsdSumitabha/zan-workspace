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
// Note on the baselines: the soft-delete hook is registered as `pre(/^find/)`
// in each model, so it applies to `find` but NOT to `countDocuments`. That is
// a pre-existing gap, unrelated to regions, and it is why the expected counts
// for find and countDocuments differ. See docs/region-rollout.md section 2.

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
    } = await import("@/lib/region-scope")

    await dbConnect()
    console.log("Database:", mongoose.connection.db?.databaseName)

    // Ground truth, straight from the driver, past every hook.
    const col = Lead.collection
    const total = await col.countDocuments({})
    const inAll = await col.countDocuments({ region: "IN" })
    const usAll = await col.countDocuments({ region: "US" })
    const inLive = await col.countDocuments({ region: "IN", deletedAt: null })
    const allLive = await col.countDocuments({ deletedAt: null })

    console.log(
        `Raw driver: ${total} leads. IN=${inAll} (${inLive} not deleted), US=${usAll}.`
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
        { name: "countDocuments as IN", run: () => asIN(() => Lead.countDocuments({})), want: inAll, wantText: `${inAll}` },
        { name: "aggregate as IN", run: () => asIN(countAgg), want: inAll, wantText: `${inAll}` },

        // A region with no data sees nothing, and cannot see IN.
        { name: "find as US", run: () => asUS(countFind), want: 0, wantText: "0" },
        { name: "countDocuments as US", run: () => asUS(() => Lead.countDocuments({})), want: usAll, wantText: `${usAll}` },

        // Admin holds every region, so it sees the sum.
        { name: "countDocuments as admin", run: () => asAdmin(() => Lead.countDocuments({})), want: inAll + usAll, wantText: `${inAll + usAll}` },
        { name: "find as admin", run: () => asAdmin(countFind), want: allLive, wantText: `${allLive}` },

        // The bypass really does bypass.
        { name: "countDocuments, bypass", run: () => runWithoutRegionScope(() => Lead.countDocuments({})), want: total, wantText: `${total}` },

        // The lazy callback form must keep the context. A Mongoose query is
        // lazy, so a callback that returns one without awaiting used to leave
        // the context before the query ran. Everything was denied, including
        // the lookup of the signed-in user.
        { name: "lazy callback keeps context", run: () => asIN(() => Lead.countDocuments({})), want: inAll, wantText: `${inAll}` },
    ]

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
