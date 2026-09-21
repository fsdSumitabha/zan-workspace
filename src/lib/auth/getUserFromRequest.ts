import { NextRequest } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"

import { verifyToken, AuthTokenPayload } from "./verifyToken"
import { runWithoutRegionScope } from "@/lib/region-scope"
import type { RegionCode } from "@/lib/region"

export interface AuthUser {
    id: string
    name?: string
    email?: string
    role: number
    isActive: boolean

    /** Read from the user row, never from the token. Can be empty. */
    regions: RegionCode[]
}

/**
 * Extracts user from request using JWT cookie
 * Returns user or null (never throws for missing auth)
 */
export async function getUserFromRequest(
    req: NextRequest
): Promise<AuthUser | null> {
    try {
        // 1. Read token from cookie
        const token = req.cookies.get("auth_token")?.value

        if (!token) {
            return null
        }

        // 2. Verify token
        let payload: AuthTokenPayload

        try {
            payload = await verifyToken(token)
        } catch {
            return null
        }

        const { userId } = payload

        if (!userId) {
            return null
        }

        // 3. Connect DB
        await dbConnect()

        // 4. Fetch user (deletedAt already handled by schema pre-hook)
        //
        // Outside the region scope on purpose. This lookup is what
        // establishes the scope, so it cannot be filtered by it. Without
        // the bypass every request would deny itself and nobody could
        // sign in. It reads one user by id, so it leaks nothing.
        const user = await runWithoutRegionScope(() =>
            User.findById(userId).select("_id name email role isActive regions")
        )

        if (!user) {
            return null
        }

        // 5. Normalize output (never expose mongoose doc directly)
        return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            regions: (user.regions ?? []) as RegionCode[]
        }

    } catch (error) {
        console.error("GET_USER_FROM_REQUEST_ERROR:", error)
        return null
    }
}