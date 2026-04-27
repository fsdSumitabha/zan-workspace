import { NextRequest } from "next/server"
import { requireAuth, AuthError } from "./requireAuth"
import { AuthUser } from "./getUserFromRequest"

/**
 * Ensures the user has one of the allowed roles
 * Throws AuthError if unauthorized
 */
export async function requireRole(
    req: NextRequest,
    allowedRoles: number[]
): Promise<AuthUser> {
    const user = await requireAuth(req)

    if (!allowedRoles.includes(user.role)) {
        throw new AuthError("You aren't authorized to perform this action.", 403)
    }

    return user
}