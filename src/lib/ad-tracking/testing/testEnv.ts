import { testDatabaseUri } from "@/lib/email/testing/db"

/**
 * Points MONGODB_URI at the `_test` database before any app module loads.
 *
 * The import code reaches src/lib/db/dbConnect.ts through the activity log
 * helpers, and that file reads MONGODB_URI when it loads. With the plain
 * value from .env.local it would hold the live database's address. Setting
 * the test address here means that even a stray dbConnect() call can only
 * reach the test database. Import it right after tsxPhoneFix.
 */
process.env.MONGODB_URI = testDatabaseUri()

export {}
