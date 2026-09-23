/**
 * Shared helpers for the one-off region migration scripts.
 *
 * Every script in this folder follows the same rules:
 *
 * 1. Dry run by default. Nothing is written without `--apply`.
 * 2. Writes go through the raw driver (`db.collection(...)`), never through a
 *    Mongoose model. Three hooks would otherwise get in the way:
 *      - softDeletePlugin hides deleted rows, and deleted rows still need a
 *        region because they still hold a phone number in the unique index.
 *      - regionScopePlugin filters by a region context that does not exist in
 *        a script, so every query would return nothing.
 *      - the audit plugin would write hundreds of ActivityLog rows with a
 *        null actor.
 * 3. Only `$set`. No delete, no replace, no `_id` is ever touched.
 * 4. Only rows that still need the change are read and written. Running a
 *    script twice is safe and the second run reports "nothing to do".
 * 5. Any row that fails is counted, named, and the process exits 1.
 *
 * These scripts are meant to be run one at a time, by hand, while watching
 * the terminal.
 */

import { config } from "dotenv"

// Same order as Next.js: .env.local wins over .env.
config({ path: ".env.local" })
config({ path: ".env" })

import type { Db } from "mongodb"

/* --------------------------------------------------------------- args --- */

export interface Args {
    apply: boolean
    limit: number | null
}

export function readArgs(): Args {
    const argv = process.argv.slice(2)
    const limitIdx = argv.indexOf("--limit")
    const limitRaw = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : NaN

    return {
        apply: argv.includes("--apply"),
        limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null,
    }
}

/* ------------------------------------------------------------ connect --- */

export interface Session {
    db: Db
    dbName: string
    host: string
    close: () => Promise<void>
}

/**
 * Connects with the app's own MONGODB_URI and prints which database it
 * reached. Read the database name before you let a script write.
 */
export async function connect(): Promise<Session> {
    const uri = process.env.MONGODB_URI

    if (!uri) {
        console.error("MONGODB_URI is not set. Check .env.local and .env.")
        process.exit(1)
    }

    const mongoose = (await import("mongoose")).default
    await mongoose.connect(uri)

    const db = mongoose.connection.db
    if (!db) {
        console.error("Connected, but no database handle. Check the URI.")
        process.exit(1)
    }

    return {
        db,
        dbName: db.databaseName,
        host: mongoose.connection.host ?? "unknown host",
        close: () => mongoose.disconnect(),
    }
}

/* ------------------------------------------------------------- banner --- */

/**
 * Prints what is about to happen, then pauses in apply mode so there is a
 * moment to press Ctrl+C after reading the database name.
 */
export async function banner(
    title: string,
    s: Session,
    args: Args
): Promise<void> {
    const mode = args.apply ? "APPLY  (this writes)" : "DRY RUN  (writes nothing)"

    console.log("")
    console.log("=".repeat(64))
    console.log(`  ${title}`)
    console.log("=".repeat(64))
    console.log(`  database : ${s.dbName}`)
    console.log(`  host     : ${s.host}`)
    console.log(`  mode     : ${mode}`)
    if (args.limit) console.log(`  limit    : ${args.limit} row(s)`)
    console.log("=".repeat(64))
    console.log("")

    if (!args.apply) return

    process.stdout.write("  Writing to the database above in ")
    for (let i = 5; i > 0; i--) {
        process.stdout.write(`${i}… `)
        await new Promise((r) => setTimeout(r, 1000))
    }
    console.log("go.\n")
}

/* ------------------------------------------------------------ report --- */

export class Report {
    readonly failures: { id: string; reason: string }[] = []
    readonly skipped: { id: string; reason: string }[] = []
    changed = 0
    examined = 0

    fail(id: string, reason: string): void {
        this.failures.push({ id, reason })
    }

    skip(id: string, reason: string): void {
        this.skipped.push({ id, reason })
    }

    /** Prints the summary and returns the exit code to use. */
    finish(label: string, apply: boolean): number {
        console.log("")
        console.log("-".repeat(64))
        console.log(`  RESULT — ${label}`)
        console.log("-".repeat(64))
        console.log(`  examined            : ${this.examined}`)
        console.log(`  ${apply ? "changed            " : "would change       "} : ${this.changed}`)
        console.log(`  skipped, no change  : ${this.skipped.length}`)
        console.log(`  FAILED              : ${this.failures.length}`)

        if (this.skipped.length) {
            console.log("")
            console.log("  Skipped rows")
            for (const s of this.skipped) console.log(`    ${s.id}  ${s.reason}`)
        }

        if (this.failures.length) {
            console.log("")
            console.log("  FAILED rows — these still need attention")
            for (const f of this.failures) console.log(`    ${f.id}  ${f.reason}`)
        }

        console.log("-".repeat(64))

        if (this.failures.length > 0) {
            console.log("  Finished WITH FAILURES. Nothing above was rolled back.")
            console.log("  Fix the rows listed, then run this script again.")
            console.log("-".repeat(64))
            return 1
        }

        if (!apply && this.changed > 0) {
            console.log("  Dry run only. Re-run with --apply to write.")
        } else if (apply && this.changed > 0) {
            console.log("  Done.")
        } else {
            console.log("  Nothing to do. Already correct.")
        }

        console.log("-".repeat(64))
        return 0
    }
}

/* ----------------------------------------------------------- progress --- */

/** One line per row, so the terminal shows movement in real time. */
export function progress(n: number, total: number, text: string): void {
    const pct = total > 0 ? Math.floor((n / total) * 100) : 100
    console.log(`  [${String(n).padStart(4)}/${total}] ${String(pct).padStart(3)}%  ${text}`)
}

/* -------------------------------------------------------------- exit --- */

export async function done(s: Session, code: number): Promise<never> {
    await s.close()
    process.exit(code)
}

export function crash(err: unknown): never {
    console.error("")
    console.error("SCRIPT CRASHED. Nothing after this point ran.")
    console.error(err)
    process.exit(1)
}
