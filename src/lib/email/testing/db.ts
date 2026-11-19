import { config } from "dotenv"
import mongoose from "mongoose"

/**
 * Connects tests to a database that is not the real one.
 *
 * ## The guard
 *
 * The production database is `zan_services`. This rewrites the database
 * name in MONGODB_URI to `<name>_test` and then REFUSES to connect unless
 * the result ends in `_test`. A test suite that deletes collections must
 * not be one typo away from the live CRM.
 *
 * The check is on the name the driver will actually use, after the rewrite,
 * so it cannot be fooled by a URI whose name only looks safe.
 *
 * ## The suite must run serially
 *
 * `node --test` runs files in parallel by default, and every file here
 * shares one database and empties collections in `beforeEach`. Two files
 * running at once clear each other's rows, which shows up as tests that
 * pass alone and fail together.
 *
 * That is why the npm scripts pass `--test-concurrency=1`. Running
 * `tsx --test` by hand without it will produce confusing failures.
 *
 * ## Why not mongodb-memory-server
 *
 * It downloads a MongoDB binary on first run, which is a large thing to
 * add to a project for a few tests, and it would be another dependency to
 * keep current. The tests here are about concurrency against a real server,
 * which is exactly what an in-memory stand-in is worst at.
 */

let connected = false

export const TEST_DB_SUFFIX = "_test"

export function testDatabaseUri(): string {
    config({ path: ".env.local" })
    config({ path: ".env" })

    const raw = process.env.MONGODB_URI

    if (!raw) {
        throw new Error(
            "MONGODB_URI is not set, so the email tests cannot run. Add it to " +
            ".env.local."
        )
    }

    const match = raw.match(
        /^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/
    )

    if (!match) {
        throw new Error(
            "MONGODB_URI does not name a database, so the test database name " +
            "cannot be derived safely. Expected mongodb://host/dbname."
        )
    }

    const [, prefix, dbName, options = ""] = match
    const base = dbName || "zan"
    const testName = base.endsWith(TEST_DB_SUFFIX)
        ? base
        : `${base}${TEST_DB_SUFFIX}`

    if (!testName.endsWith(TEST_DB_SUFFIX)) {
        throw new Error(`Refusing to use the database "${testName}" for tests.`)
    }

    return `${prefix}/${testName}${options}`
}

/** Connects once per test process. Safe to call from every test file. */
export async function connectTestDb(): Promise<typeof mongoose> {
    if (connected) return mongoose

    const uri = testDatabaseUri()
    await mongoose.connect(uri, { bufferCommands: false })

    const name = mongoose.connection.db?.databaseName ?? ""

    // The belt to the braces above. If anything about the rewrite ever
    // changes, this is what stops a test suite emptying the real database.
    if (!name.endsWith(TEST_DB_SUFFIX)) {
        await mongoose.disconnect()
        throw new Error(
            `Connected to "${name}", which is not a test database. Refusing to ` +
            "run. Tests only ever run against a name ending in _test."
        )
    }

    connected = true
    return mongoose
}

export async function disconnectTestDb(): Promise<void> {
    if (!connected) return
    await mongoose.disconnect()
    connected = false
}

/**
 * Empties the named collections.
 *
 * It re-checks the database name every time rather than trusting that
 * connectTestDb ran first, because a deleteMany against the wrong database
 * is not recoverable.
 */
export async function clearCollections(
    models: Array<{ deleteMany: (filter: Record<string, unknown>) => unknown }>
): Promise<void> {
    const name = mongoose.connection.db?.databaseName ?? ""

    if (!name.endsWith(TEST_DB_SUFFIX)) {
        throw new Error(
            `Refusing to clear collections in "${name}". Not a test database.`
        )
    }

    for (const model of models) {
        await model.deleteMany({})
    }
}

/**
 * Runs a function with the region scope bypassed.
 *
 * Every email model carries regionScopePlugin, which filters by the region
 * context. Tests have no request and therefore no context, and an empty
 * context matches nothing on purpose. Bypassing is how a test reads back
 * what it just wrote.
 */
export async function withoutRegionScope<T>(fn: () => Promise<T>): Promise<T> {
    const { runWithoutRegionScope } = await import("@/lib/region-scope")
    return runWithoutRegionScope(fn) as Promise<T>
}
