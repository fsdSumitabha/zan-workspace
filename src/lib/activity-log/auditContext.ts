import { AsyncLocalStorage } from "async_hooks"
import type { AuditContextStore } from "./types"

/**
 * Why look up `globalThis` at CALL time (not module-load time):
 *
 * Next.js / Turbopack HMR can re-execute this module independently of the
 * modules that import it. If we captured the ALS instance into a
 * module-scoped `const`, modules that imported the pre-HMR version
 * (e.g. requireAuth) would keep a closure over the OLD ALS instance,
 * while modules that re-resolved after HMR (e.g. the Mongoose plugin)
 * would use a NEW one. Writers and readers would be on different
 * AsyncLocalStorages and every audit row would land with `userId: null`.
 *
 * By resolving `globalThis.__auditStorage` on every call, we always reach
 * the single process-wide singleton no matter when the caller's
 * `import` was evaluated.
 */
declare global {
    // eslint-disable-next-line no-var
    var __auditStorage:
        | AsyncLocalStorage<AuditContextStore>
        | undefined
}

function getStorage(): AsyncLocalStorage<AuditContextStore> {
    if (!globalThis.__auditStorage) {
        globalThis.__auditStorage =
            new AsyncLocalStorage<AuditContextStore>()
    }
    return globalThis.__auditStorage
}

export function getAuditContext(): AuditContextStore | undefined {
    return getStorage().getStore()
}

export function runWithAuditContext<T>(
    context: AuditContextStore,
    fn: () => T | Promise<T>
): Promise<T> {
    return Promise.resolve(getStorage().run(context, fn))
}

/**
 * Enters an EMPTY audit context and hands back the store.
 *
 * Must be called before the first `await` in the request. See the long note
 * in requireAuth: enterWith() only reaches the caller while it still runs
 * inside the caller's synchronous execution. Fill the actor in later by
 * assigning to the returned object.
 */
export function beginAuditContext(): AuditContextStore {
    const store: AuditContextStore = { userId: null }
    getStorage().enterWith(store)
    return store
}

/**
 * Sets the audit actor.
 *
 * If a store is already entered, this mutates it in place rather than
 * entering a new one. Entering a new one after an await would be invisible
 * to the caller.
 */
export function enterAuditContext(userId: string | null): void {
    const existing = getStorage().getStore()
    if (existing) {
        existing.userId = userId
        return
    }
    getStorage().enterWith({ userId })
}
