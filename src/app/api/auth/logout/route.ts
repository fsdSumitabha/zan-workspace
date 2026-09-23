import { NextResponse } from "next/server"
import { ACTIVE_REGION_COOKIE } from "@/lib/region-scope"

export async function POST() {
    try {
        const res = NextResponse.json(
            {
                success: true,
                message: "Logged out successfully"
            },
            { status: 200 }
        )

        // Clear the cookie
        res.cookies.set("auth_token", "", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            expires: new Date(0) // expire immediately
        })

        // Drop the region pin too. Without this the next person to sign in on
        // this browser inherits it, silently, if they hold that region as
        // well. The session ends, so the view preference should end with it.
        res.cookies.delete(ACTIVE_REGION_COOKIE)

        return res
    } catch (error) {
        console.error("LOGOUT_ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}