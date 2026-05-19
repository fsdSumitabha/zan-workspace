import type { NextRequest } from "next/server"

import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { runWithAuditContext } from "./auditContext"

/**
 * Runs the handler after requireAuth, with audit context (userId) active
 * for Mongoose audit middleware.
 */
export async function runWithAuthAndAudit<T>(
    req: NextRequest,
    fn: (user: AuthUser) => Promise<T>
): Promise<T> {
    const user = await requireAuth(req)
    return runWithAuditContext({ userId: user.id }, () => fn(user))
}

export { AuthError }
