import { NextResponse } from "next/server"

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