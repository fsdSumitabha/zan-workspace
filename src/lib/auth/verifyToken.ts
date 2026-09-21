import { jwtVerify, JWTPayload } from "jose"
import type { RegionCode } from "@/lib/region"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export interface AuthTokenPayload extends JWTPayload {
    userId: string
    role: number

    /**
     * Regions, copied into the token at login.
     *
     * This copy exists only for `src/proxy.ts`, which runs at the edge and
     * cannot reach the database. API routes must NOT trust it. They read
     * `regions` from the user row instead, because the token lasts 7 days
     * and a revoked region would otherwise stay live for a week.
     *
     * Optional: tokens issued before regions existed do not carry it.
     */
    regions?: RegionCode[]
}

/**
 * Verifies JWT token and returns payload
 * Throws error if invalid / expired
 */
export async function verifyToken(token: string): Promise<AuthTokenPayload> {
    if (!token) {
        throw new Error("NO_TOKEN")
    }

    try {
        const { payload } = await jwtVerify(token, JWT_SECRET)

        // Basic shape validation
        if (!payload || typeof payload !== "object") {
            throw new Error("INVALID_TOKEN_PAYLOAD")
        }

        const userId = payload.userId
        const role = payload.role

        if (!userId || typeof userId !== "string") {
            throw new Error("INVALID_TOKEN_USER")
        }

        if (typeof role !== "number") {
            throw new Error("INVALID_TOKEN_ROLE")
        }

        return payload as AuthTokenPayload

    } catch (error: any) {
        // Normalize jose errors into your system
        if (error.code === "ERR_JWT_EXPIRED") {
            throw new Error("TOKEN_EXPIRED")
        }

        throw new Error("INVALID_TOKEN")
    }
}