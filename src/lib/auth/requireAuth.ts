import { NextRequest } from "next/server"
import { beginAuditContext } from "@/lib/activity-log/auditContext"
import {
    beginRegionContext,
    narrowToActiveRegion,
    ACTIVE_REGION_COOKIE,
} from "@/lib/region-scope"
import { getUserFromRequest, AuthUser } from "./getUserFromRequest"
import { AuthError } from "./AuthError"

export { AuthError }


/**
 * Verifies the request, and sets up the two per-request contexts: the audit
 * actor and the region scope.
 *
 * ## Why both contexts are entered before the first await
 *
 * `AsyncLocalStorage.enterWith()` only reaches the caller while it is still
 * running inside the caller's synchronous execution. Once this function
 * awaits, an `enterWith()` after that await is invisible to the route that
 * called us. Proven behaviour, not a guess:
 *
 *     enterWith only, no await before   : { v: 'set' }
 *     await, then enterWith             : undefined
 *     run() exits, then enterWith       : undefined
 *
 * So both stores are entered empty, synchronously, before `getUserFromRequest`
 * is awaited, and then filled in by assigning to the same object. The caller
 * holds that object, so it sees the values.
 *
 * This was already broken for the audit actor before regions existed. The
 * ActivityLog rows that do carry a user got it from the explicit `userId`
 * argument to `auditedCreate` and friends, not from this context.
 *
 * Both stores start empty on purpose. An empty region list denies every
 * query, so if auth throws below, nothing is readable.
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
    const audit = beginAuditContext()
    const region = beginRegionContext()

    const user = await getUserFromRequest(req)

    if (!user) {
        throw new AuthError("You aren't authorized to perform this action.", 401)
    }

    if (!user.isActive) {
        throw new AuthError("Your account is deactivated.", 403)
    }

    audit.userId = user.id

    // These two lines are the only place a signed-in request gets its region.
    // Narrowing them here is the whole region switch: every route, every
    // query and every stamped write follows, with no other change anywhere.
    //
    // The cookie can only narrow. The result is always a subset of what the
    // user row says, so the cookie never has to be trusted.
    const selection = narrowToActiveRegion(
        req.cookies.get(ACTIVE_REGION_COOKIE)?.value,
        user.regions
    )

    region.regions = selection.regions
    region.writeRegion = selection.writeRegion

    if (user.regions.length === 0) {
        console.warn(
            `[region] user ${user.id} has no regions. Every query will return ` +
            "nothing. Run: npm run db:backfill-region"
        )
    }

    return user
}
