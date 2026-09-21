import { AsyncLocalStorage } from "async_hooks"
import type { RegionCode } from "@/lib/region"

/**
 * Per-request region scope.
 *
 * `requireAuth` fills this from the signed-in user. The Mongoose plugin in
 * `regionScopePlugin.ts` reads it on every query and adds the region filter.
 * Nothing else needs to know about regions.
 *
 * The `globalThis` lookup happens at CALL time, not module-load time, for the
 * same reason as `src/lib/activity-log/auditContext.ts`: Next.js and Turbopack
 * can re-execute this module on their own. A module-scoped `const` would leave
 * writers and readers holding different AsyncLocalStorage instances, and every
 * query would silently fall back to "no context".
 *
 * "No context" means DENY. See `regionScopePlugin.ts`.
 */

export interface RegionContextStore {
    /** Regions this request may read. Already narrowed if a region is pinned. */
    regions: RegionCode[]

    /**
     * Region that new records get stamped with.
     * `null` when the user owns more than one region and has not picked one,
     * which is the admin case. Then the caller must set `region` itself.
     */
    writeRegion: RegionCode | null

    /** Skips the filter completely. Only for the call sites listed in index.ts. */
    bypass?: boolean
}

declare global {
    // eslint-disable-next-line no-var
    var __regionStorage: AsyncLocalStorage<RegionContextStore> | undefined
}

function getStorage(): AsyncLocalStorage<RegionContextStore> {
    if (!globalThis.__regionStorage) {
        globalThis.__regionStorage = new AsyncLocalStorage<RegionContextStore>()
    }
    return globalThis.__regionStorage
}

export function getRegionContext(): RegionContextStore | undefined {
    return getStorage().getStore()
}

/**
 * Enters a DENY-ALL region scope and hands back the store.
 *
 * Must be called before the first `await` in the request. See the long note
 * in requireAuth. Fill the regions in later by assigning to the returned
 * object; the caller holds the same object, so it sees the change.
 *
 * It starts empty, which denies everything. If auth throws before the
 * regions are filled in, nothing is readable. That is the right way round.
 */
export function beginRegionContext(): RegionContextStore {
    const store: RegionContextStore = { regions: [], writeRegion: null }
    getStorage().enterWith(store)
    return store
}

/**
 * Sets the region scope for the rest of the current request.
 *
 * If a store is already entered, this mutates it in place rather than
 * entering a new one. Entering a new one after an await would be invisible
 * to the caller. Used by the public endpoints, which set their scope before
 * they await anything.
 */
export function enterRegionContext(store: RegionContextStore): void {
    const existing = getStorage().getStore()
    if (existing) {
        existing.regions = store.regions
        existing.writeRegion = store.writeRegion
        existing.bypass = store.bypass
        return
    }
    getStorage().enterWith(store)
}

/**
 * Runs `fn` with a region scope of its own, then restores the old one.
 * Use this when one request has to read outside its own regions, such as an
 * admin reading a single region, or a script.
 */
export function runWithRegionContext<T>(
    store: RegionContextStore,
    fn: () => T | Promise<T>
): Promise<T> {
    // The await has to happen INSIDE run(), not outside it.
    //
    // A Mongoose query is lazy. `() => User.findById(id)` returns a Query
    // object and runs nothing. If run() is handed that callback directly, it
    // returns the Query and restores the previous context straight away, and
    // the query then executes with no region context at all. Every such call
    // was silently denied, including the one that loads the signed-in user.
    //
    // Wrapping in an async function that awaits keeps the execution inside
    // the context, so callers can pass the short lazy form safely.
    return getStorage().run(store, async () => await fn())
}

/**
 * Runs `fn` with no region filter at all.
 *
 * Every use of this is a hole in the region wall, so there is a short list of
 * places that are allowed to call it:
 *
 *   - Login and `getUserFromRequest`. They look a user up before the region
 *     scope exists, so they cannot be filtered by it.
 *   - The public intake endpoints and the Facebook webhook. Nobody is signed
 *     in. They must set `region` on the record themselves.
 *   - Scripts under `src/scripts`.
 *
 * Do not add a fourth reason without writing it down here.
 */
export function runWithoutRegionScope<T>(fn: () => T | Promise<T>): Promise<T> {
    return runWithRegionContext({ regions: [], writeRegion: null, bypass: true }, fn)
}
