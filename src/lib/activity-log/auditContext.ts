import { AsyncLocalStorage } from "async_hooks"
import type { AuditContextStore } from "./types"

const auditStorage = new AsyncLocalStorage<AuditContextStore>()

export function getAuditContext(): AuditContextStore | undefined {
    return auditStorage.getStore()
}

export function runWithAuditContext<T>(
    context: AuditContextStore,
    fn: () => T | Promise<T>
): Promise<T> {
    return Promise.resolve(auditStorage.run(context, fn))
}

/** Sets audit actor for the rest of the current async request (use after auth). */
export function enterAuditContext(userId: string | null): void {
    auditStorage.enterWith({ userId })
}
