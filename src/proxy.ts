import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function proxy(req: NextRequest) {
    const token = req.cookies.get("auth_token")?.value
    const { pathname } = req.nextUrl

    // ✅ Public route (login)
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

    // ✅ Protected routes (everything under /admin except login)
    if (pathname.startsWith("/admin")) {
        if (!token) {
            return NextResponse.redirect(
                new URL("/admin/authentication/login", req.url)
            )
        }

        try {
            await jwtVerify(token, JWT_SECRET)
            return NextResponse.next()
        } catch {
            return NextResponse.redirect(
                new URL("/admin/authentication/login", req.url)
            )
        }
    }

    return NextResponse.next()
}