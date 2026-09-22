// Checks the rules that decide which regions an account may be given.
//
//   npm run db:test-region-grant
//
// No database, no network. Pure logic, so it is safe to run anywhere.
// These rules are the only thing stopping a user in one region from
// creating an account in another and signing in as it.

import { resolveGrantedRegions, parseRegionsInput, RegionChoiceError } from "@/lib/region-scope/regionGrant"
import { narrowToActiveRegion } from "@/lib/region-scope/activeRegion"

type Case = [name: string, fn: () => unknown, expect: string]

const cases: Case[] = [
    ["admin grants US only",
        () => resolveGrantedRegions({ submitted: ["US"], granter: ["IN","US","AE"] }),
        "US"],
    ["IN-only user grants IN",
        () => resolveGrantedRegions({ submitted: ["IN"], granter: ["IN"] }),
        "IN"],
    ["IN-only user tries to grant US",
        () => resolveGrantedRegions({ submitted: ["US"], granter: ["IN"] }),
        "403 You do not have access to: US"],
    ["nobody can grant nothing",
        () => resolveGrantedRegions({ submitted: [], granter: ["IN","US"] }),
        "400 Pick at least one region"],
    ["unknown code rejected",
        () => resolveGrantedRegions({ submitted: ["UK"], granter: ["IN","US","AE"] }),
        "400 Unknown region: UK"],
    ["IN-only editor keeps target's US",
        () => resolveGrantedRegions({ submitted: ["IN"], granter: ["IN"], existing: ["IN","US"] }),
        "IN,US"],
    ["IN-only editor cannot strip target's US",
        () => resolveGrantedRegions({ submitted: [], granter: ["IN"], existing: ["IN","US"] }),
        "US"],
    ["admin can strip US",
        () => resolveGrantedRegions({ submitted: ["IN"], granter: ["IN","US","AE"], existing: ["IN","US"] }),
        "IN"],
    ["order is stable",
        () => resolveGrantedRegions({ submitted: ["AE","US","IN"], granter: ["IN","US","AE"] }),
        "IN,US,AE"],
    ["duplicates collapse",
        () => resolveGrantedRegions({ submitted: ["US","US"], granter: ["IN","US","AE"] }),
        "US"],
    ["HR (role 20) grants US while holding IN only",
        () => resolveGrantedRegions({ submitted: ["US"], granter: ["IN"], granterRole: 20 }),
        "US"],
    ["HR grants all three",
        () => resolveGrantedRegions({ submitted: ["IN","US","AE"], granter: ["IN"], granterRole: 20 }),
        "IN,US,AE"],
    ["HR can strip a region it does not hold",
        () => resolveGrantedRegions({ submitted: ["IN"], granter: ["IN"], granterRole: 20, existing: ["IN","US"] }),
        "IN"],
    ["HR still cannot leave it empty",
        () => resolveGrantedRegions({ submitted: [], granter: ["IN"], granterRole: 20 }),
        "400 Pick at least one region"],
    ["US Leads Manager (69) cannot grant IN",
        () => resolveGrantedRegions({ submitted: ["IN"], granter: ["US"], granterRole: 69 }),
        "403 You do not have access to: IN"],
    ["Ops Manager (15) cannot grant US",
        () => resolveGrantedRegions({ submitted: ["US"], granter: ["IN"], granterRole: 15 }),
        "403 You do not have access to: US"],
    // --- the region switch. The cookie may only ever narrow. ---
    ["no cookie: admin sees all three",
        () => narrowToActiveRegion(undefined, ["IN","US","AE"]).regions,
        "IN,US,AE"],
    ["pinned to US: only US",
        () => narrowToActiveRegion("US", ["IN","US","AE"]).regions,
        "US"],
    ["pinned to US: writes stamp US",
        () => [narrowToActiveRegion("US", ["IN","US","AE"]).writeRegion],
        "US"],
    ["unpinned admin: writes need an explicit pick",
        () => [String(narrowToActiveRegion("ALL", ["IN","US","AE"]).writeRegion)],
        "null"],
    ["ALL restores everything",
        () => narrowToActiveRegion("ALL", ["IN","US","AE"]).regions,
        "IN,US,AE"],
    ["CANNOT widen: pin to a region not held",
        () => narrowToActiveRegion("US", ["IN"]).regions,
        "IN"],
    ["CANNOT widen: forged junk value",
        () => narrowToActiveRegion("../../etc", ["IN"]).regions,
        "IN"],
    ["CANNOT widen: unknown code",
        () => narrowToActiveRegion("XX", ["IN"]).regions,
        "IN"],
    ["stale pin after regions revoked falls back",
        () => narrowToActiveRegion("AE", ["IN","US"]).regions,
        "IN,US"],
    ["lowercase cookie still works",
        () => narrowToActiveRegion("us", ["IN","US"]).regions,
        "US"],
    ["single-region user is unaffected",
        () => narrowToActiveRegion(undefined, ["US"]).regions,
        "US"],
    ["parse: repeated fields",
        () => parseRegionsInput(["us", " IN "]),
        "US,IN"],
    ["parse: JSON array",
        () => parseRegionsInput(['["US","AE"]']),
        "US,AE"],
    ["parse: junk ignored",
        () => parseRegionsInput(["", "[bad json"]),
        ""],
]

let failed = 0
for (const [name, fn, want] of cases) {
    let got: string
    try {
        got = (fn() as string[]).join(",")
    } catch (e) {
        got = e instanceof RegionChoiceError ? `${e.statusCode} ${e.message}` : `THREW ${(e as Error).message}`
    }
    const ok = got === want
    if (!ok) failed++
    console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(36)} -> ${got}${ok ? "" : `   want "${want}"`}`)
}
console.log("")
if (failed) { console.error(`${failed} failed`); process.exit(1) }
console.log("All grant rules hold.")
