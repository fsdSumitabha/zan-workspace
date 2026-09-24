// Checks the lead source sheet rules. No database needed.
//
//   npm run test:lead-source-sheet
//
// Runs the checks below and exits 1 if any fails. Run it after editing
// src/config/leadSourceSheet.ts.
//
//   npm run test:lead-source-sheet -- "omain_name, create_date, name, phone"
//
// With a header row as the argument, it prints how each header would be
// matched against the config instead, and what the upload would say.
//
// The phone checks are not here. src/lib/phone.ts cannot be imported under
// tsx (see src/scripts/region-migration/03-leads-phone.ts), so phones are
// covered by uploading a file in the app.

interface Case {
    name: string
    got: unknown
    want: unknown
}

async function main() {
    const { matchHeaderRow, findHeaderRow, normalizeHeader } = await import("@/lib/lead-sources/sheet/headers")
    const { parseCsv } = await import("@/lib/lead-sources/sheet/csv")
    const { readDate } = await import("@/lib/lead-sources/sheet/dates")
    const { addDays, isDayString, resolveClientToday, utcTodayString, formatDay } = await import("@/lib/lead-sources/day")

    const arg = process.argv.slice(2).join(" ").trim()
    if (arg) {
        const cells = arg.split(/[,;\t]/).map((c) => c.trim())
        const match = matchHeaderRow(cells)
        console.log("")
        for (const c of match.columns) {
            console.log(`${c.header.padEnd(28)} -> ${c.known ? `${c.key} (${c.label})` : "unknown, kept as extra data"}`)
        }
        console.log("")
        if (match.missingRequired.length) console.log("REFUSED. Missing required:", match.missingRequired.map((c) => c.key).join(", "))
        if (match.duplicates.length) console.log("REFUSED. Same column twice:", JSON.stringify(match.duplicates))
        if (match.missingOptional.length) console.log("Not in this header, left empty:", match.missingOptional.map((c) => c.key).join(", "))
        if (!match.missingRequired.length && !match.duplicates.length) console.log("OK. This header row would be accepted.")
        return
    }

    const USER_HEADER =
        "omain_name, create_date, expiry_date, domain_Company_name, name, company, address, city, state, zip, country, email, phone"
            .split(",")
            .map((h) => h.trim())

    const userMatch = matchHeaderRow(USER_HEADER)
    const withExtra = matchHeaderRow([...USER_HEADER, "Notes"])
    const noPhone = matchHeaderRow(USER_HEADER.filter((h) => h !== "phone"))
    const twice = matchHeaderRow([...USER_HEADER, "Phone Number"])
    const report = matchHeaderRow(["Row no", ...USER_HEADER, "Upload result", "Upload notes"])
    const found = findHeaderRow([["September list"], [""], USER_HEADER, ["a.com", "", "", "", "Ann", "", "", "", "", "", "US", "", "+1 646 555 0100"]])

    const today = utcTodayString()

    const cases: Case[] = [
        // Headers
        { name: "clean header text", got: normalizeHeader("  Domain-Name. "), want: "domain_name" },
        { name: "the shared header row matches all 13", got: userMatch.columns.filter((c) => c.known).length, want: 13 },
        { name: "omain_name reads as domain_name", got: userMatch.columns[0]?.key, want: "domain_name" },
        { name: "domain_Company_name matches", got: userMatch.columns[3]?.key, want: "domain_company_name" },
        { name: "nothing required is missing", got: userMatch.missingRequired.length, want: 0 },
        { name: "an unknown header is kept", got: withExtra.unknown.map((c) => c.key), want: ["notes"] },
        { name: "no phone column is refused", got: noPhone.missingRequired.map((c) => c.key), want: ["phone"] },
        { name: "phone twice is refused", got: twice.duplicates.length, want: 1 },
        { name: "report columns are ignored", got: report.columns.length, want: 13 },
        { name: "header under a title row is found", got: found?.index, want: 2 },

        // CSV
        { name: "csv with ; and quotes", got: parseCsv('a;b\r\n"x;y";"say ""hi"""\r\n'), want: [["a", "b"], ["x;y", 'say "hi"']] },
        { name: "csv with a line break in a cell", got: parseCsv('a,b\n"line 1\nline 2",c\n'), want: [["a", "b"], ["line 1\nline 2", "c"]] },
        { name: "csv drops the BOM and blank end rows", got: parseCsv("﻿a,b\n1,2\n\n,\n"), want: [["a", "b"], ["1", "2"]] },

        // Dates
        { name: "ISO date", got: readDate("2020-01-15", "DMY"), want: "2020-01-15" },
        { name: "ISO date and time", got: readDate("2020-01-15T10:00:00Z", "DMY"), want: "2020-01-15" },
        { name: "15-Jan-2021", got: readDate("15-Jan-2021", "DMY"), want: "2021-01-15" },
        { name: "Jan 15, 2021", got: readDate("Jan 15, 2021", "DMY"), want: "2021-01-15" },
        { name: "03/04/2021 in IN is 3 April", got: readDate("03/04/2021", "DMY"), want: "2021-04-03" },
        { name: "03/04/2021 in US is 4 March", got: readDate("03/04/2021", "MDY"), want: "2021-03-04" },
        { name: "01/15/2027 is clear either way", got: readDate("01/15/2027", "DMY"), want: "2027-01-15" },
        { name: "Excel day number", got: readDate("43845", "DMY"), want: "2020-01-15" },
        { name: "31 February is not a date", got: readDate("2021-02-31", "DMY"), want: null },
        { name: "text is not a date", got: readDate("not a date", "DMY"), want: null },

        // Days
        { name: "a real day", got: isDayString("2026-02-28"), want: true },
        { name: "not a real day", got: isDayString("2026-02-30"), want: false },
        { name: "add days across a month", got: addDays("2026-01-31", 1), want: "2026-02-01" },
        { name: "a far-off 'today' is refused", got: resolveClientToday("2001-01-01"), want: today },
        { name: "tomorrow in UTC is a real local today", got: resolveClientToday(addDays(today, 1)), want: addDays(today, 1) },
        { name: "day name", got: formatDay(addDays(today, 1), today), want: "Tomorrow" },
    ]

    let failed = 0
    for (const c of cases) {
        const ok = JSON.stringify(c.got) === JSON.stringify(c.want)
        if (!ok) failed++
        console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}${ok ? "" : `\n      got  ${JSON.stringify(c.got)}\n      want ${JSON.stringify(c.want)}`}`)
    }

    console.log(`\n${cases.length - failed} of ${cases.length} passed.`)
    if (failed) process.exit(1)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
