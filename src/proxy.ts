import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify, type JWTPayload } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

interface AuthPayload extends JWTPayload {
    id: string
    role: number
}

const OBJECT_ID = String.raw`[a-f0-9]{24}`

// Centralized RBAC config — add new protected paths here
const routePermissions: Array<{ pattern: RegExp; roles: number[] }> = [
    { pattern: /^\/admin\/operations\/users(\/|$)/, roles: [10, 20] },
    { pattern: /^\/admin\/operations\/leads\/create(\/|$)/, roles: [10, 60] },
    { pattern: new RegExp(`^/admin/operations/leads/${OBJECT_ID}/convert(/|$)`), roles: [10, 60], },
    { pattern: new RegExp(`^/admin/operations/clients/${OBJECT_ID}/projects/create(/|$)`), roles: [10, 60], },
]

function getRequiredRoles(pathname: string): number[] | null {
    const match = routePermissions.find((rp) => rp.pattern.test(pathname))
    return match ? match.roles : null
}

export async function proxy(req: NextRequest) {
    const token = req.cookies.get("auth_token")?.value
    const { pathname } = req.nextUrl

    // Public route (login)
    if (pathname.startsWith("/admin/authentication/login")) {
        if (token) {
            try {
                await jwtVerify(token, JWT_SECRET)

                // Already logged in → redirect to dashboard
                return NextResponse.redirect(
                    new URL("/admin/operations", req.url)
                )
            } catch {
                // invalid token → allow access to login
            }
        }

        return NextResponse.next()
    }

    // Protected routes (everything under /admin except login)
    if (pathname.startsWith("/admin")) {
        if (!token) {
            return NextResponse.redirect(
                new URL("/admin/authentication/login", req.url)
            )
        }

        try {
            const { payload } = await jwtVerify(token, JWT_SECRET)
            const user = payload as AuthPayload

            // RBAC check
            const requiredRoles = getRequiredRoles(pathname)
            if (requiredRoles && !requiredRoles.includes(user.role)) {
                // Authenticated but not authorized
                return NextResponse.redirect(
                    new URL("/admin/authentication/unauthorized", req.url)
                )
            }

            return NextResponse.next()
        } catch {
            return NextResponse.redirect(
                new URL("/admin/authentication/unauthorized", req.url)
            )
        }
    }

    return NextResponse.next()
}