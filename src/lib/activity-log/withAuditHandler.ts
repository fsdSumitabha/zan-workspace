import type { NextRequest, NextResponse } from "next/server"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { runWithAuditContext } from "./auditContext"
import type { AuditContextStore } from "./types"

/**
 * Sets audit context (actor userId) for the request so Mongoose audit
 * middleware can attach userId to ActivityLog rows.
 */
export async function runWithAuditFromRequest<T>(
    req: NextRequest,
    fn: () => T | Promise<T>
): Promise<T> {
    const user = await getUserFromRequest(req)

    return runWithAuditContext(
        { userId: user?.id ?? null },
        fn
    )
}

export function runWithAuditActor<T>(
    context: AuditContextStore,
    fn: () => T | Promise<T>
): Promise<T> {
    return runWithAuditContext(context, fn)
}

type RouteHandler<Ctx> = (
    req: NextRequest,
    context: Ctx
) => Promise<NextResponse> | NextResponse

/**
 * API route wrapper — run handler inside audit context (HTTP-layer middleware).
 */
export function withAuditHandler<Ctx>(
    handler: RouteHandler<Ctx>
): RouteHandler<Ctx> {
    return async (req, context) => {
        return runWithAuditFromRequest(req, () => handler(req, context))
    }
}
