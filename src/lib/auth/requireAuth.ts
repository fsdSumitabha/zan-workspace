import { NextRequest } from "next/server"
import { getUserFromRequest, AuthUser } from "./getUserFromRequest"

export class AuthError extends Error {
    statusCode: number

    constructor(message: string, statusCode: number = 401) {
        super(message)
        this.statusCode = statusCode

        // fix prototype chain (important in TS)
        Object.setPrototypeOf(this, AuthError.prototype)
    }
}

/**
 * Ensures the request has a valid authenticated user
 * Throws AuthError if not authenticated
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
    const user = await getUserFromRequest(req)

    if (!user) {
        throw new AuthError("You aren't authorized to perform this action.", 401)
    }

    if (!user.isActive) {
        throw new AuthError("Your account is deactivated.", 403)
    }

    return user
}