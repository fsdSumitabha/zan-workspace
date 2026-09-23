// Checks that nobody can create a record in a region they cannot read.
//
//   npm run db:test-region-writes
//
// Read-only. It calls `validate()`, which runs regionScopePlugin's hooks but
// never saves. It needs at least one IN lead and one US lead in the database.
//
// Covers the two bugs in docs/region-ui-test-results.md:
//   Bug 1. A user holding IN only could add a meeting or a project to a US
//          record, and it was saved in US.
//   Bug 2. An admin could not create a lead or client, even when pinned to
//          one region.

import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

type Outcome = string

async function main() {
    const dbConnect = (await import("@/lib/db/dbConnect")).default
    const mongoose = (await import("mongoose")).default
    const Lead = (await import("@/models/Lead")).default
    const Client = (await import("@/models/Client")).default
    const Meeting = (await import("@/models/Meeting")).default
    const Project = (await import("@/models/Project")).default
    const { AuthError } = await import("@/lib/auth/AuthError")
    const { runWithRegionContext } = await import("@/lib/region-scope")
    const { resolveWriteRegion, RegionChoiceError } = await import(
        "@/lib/region-scope/resolveWriteRegion"
    )

    await dbConnect()
    console.log("Database:", mongoose.connection.db?.databaseName)

    const inLead = await Lead.collection.findOne({ region: "IN" })
    const usLead = await Lead.collection.findOne({ region: "US" })
    const usClient = await Client.collection.findOne({ region: "US" })
    if (!inLead || !usLead) {
        throw new Error("Needs at least one IN lead and one US lead.")
    }

    const asIN = <T>(fn: () => Promise<T> | T) =>
        runWithRegionContext({ regions: ["IN"], writeRegion: "IN" }, fn)
    const asAdminAll = <T>(fn: () => Promise<T> | T) =>
        runWithRegionContext({ regions: ["IN", "US", "AE"], writeRegion: null }, fn)
    const asAdminUS = <T>(fn: () => Promise<T> | T) =>
        runWithRegionContext({ regions: ["US"], writeRegion: "US" }, fn)

    // "refused 404", "refused 403", or "region XX" when the hook let it
    // through. A later required-field error still counts as let through:
    // the region hook runs first and has already stamped the region.
    const tryValidate = async (doc: InstanceType<typeof Meeting>): Promise<Outcome> => {
        try {
            await doc.validate()
        } catch (err) {
            if (err instanceof AuthError) return `refused ${err.statusCode}`
        }
        return `region ${doc.get("region")}`
    }

    const meetingOn = (leadId: unknown) =>
        new Meeting({ entityType: 0, entityId: leadId, title: "test" })

    const admin = { id: "x", regions: ["IN", "US", "AE"] } as never
    const inUser = { id: "x", regions: ["IN"] } as never

    const tryResolve = (requested: unknown, user: never): Outcome => {
        try {
            return `region ${resolveWriteRegion(requested, user)}`
        } catch (err) {
            if (err instanceof RegionChoiceError) return `refused ${err.statusCode}`
            throw err
        }
    }

    const cases: { name: string; run: () => Promise<Outcome>; want: Outcome }[] = [
        // Bug 1. Child records.
        { name: "IN user, meeting on IN lead", run: () => asIN(() => tryValidate(meetingOn(inLead._id))), want: "region IN" },
        { name: "IN user, meeting on US lead", run: () => asIN(() => tryValidate(meetingOn(usLead._id))), want: "refused 404" },
        { name: "IN user, meeting on US lead, region sent", run: () => asIN(() => tryValidate(new Meeting({ entityType: 0, entityId: usLead._id, title: "t", region: "US" }))), want: "refused 404" },
        { name: "IN user, lead with region US", run: () => asIN(() => tryValidate(new Lead({ name: "t", region: "US" }) as never)), want: "refused 403" },
        { name: "admin pinned US, meeting on IN lead", run: () => asAdminUS(() => tryValidate(meetingOn(inLead._id))), want: "refused 404" },
        { name: "admin all, meeting on US lead", run: () => asAdminAll(() => tryValidate(meetingOn(usLead._id))), want: "region US" },

        // Bug 2. Top-level records.
        { name: "admin all, no region", run: () => asAdminAll(async () => tryResolve(undefined, admin)), want: "refused 400" },
        { name: "admin all, region US", run: () => asAdminAll(async () => tryResolve("US", admin)), want: "region US" },
        { name: "admin pinned US, no region", run: () => asAdminUS(async () => tryResolve(undefined, admin)), want: "region US" },
        { name: "admin pinned US, region IN", run: () => asAdminUS(async () => tryResolve("IN", admin)), want: "refused 400" },
        { name: "IN user, no region", run: () => asIN(async () => tryResolve(undefined, inUser)), want: "region IN" },
        { name: "IN user, region US", run: () => asIN(async () => tryResolve("US", inUser)), want: "refused 403" },
    ]

    if (usClient) {
        cases.push({
            name: "IN user, project on US client",
            run: () => asIN(() => tryValidate(new Project({ clientId: usClient._id, title: "t" }) as never)),
            want: "refused 404",
        })
    } else {
        console.log("No US client. Skipping the project case.")
    }

    let failed = 0
    for (const c of cases) {
        let got: Outcome
        try {
            got = await c.run()
        } catch (err) {
            got = `threw: ${(err as Error).message}`
        }
        const ok = got === c.want
        if (!ok) failed++
        console.log(
            `${ok ? "OK  " : "FAIL"}  ${c.name.padEnd(42)} ${got}` +
            (ok ? "" : `   want ${c.want}`)
        )
    }

    console.log("")
    await mongoose.disconnect()

    if (failed > 0) {
        console.error(`${failed} check(s) failed.`)
        process.exit(1)
    }
    console.log("All checks passed.")
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
