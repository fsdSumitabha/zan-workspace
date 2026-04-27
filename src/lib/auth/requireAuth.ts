import { NextRequest } from "next/server"
import { getUserFromRequest, AuthUser } from "./getUserFromRequest"

export class AuthError extends Error {
    status: number

    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

/**
 * Ensures the request has a valid authenticated user
 * Throws AuthError if not authenticated
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
    const user = await getUserFromRequest(req)

    if (!user) {
        throw new AuthError("Unauthorized", 401)
    }

    if (!user.isActive) {
        throw new AuthError("Account deactivated", 403)
    }

    return user
}