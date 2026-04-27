import { jwtVerify, JWTPayload } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export interface AuthTokenPayload extends JWTPayload {
    userId: string
    role: number
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