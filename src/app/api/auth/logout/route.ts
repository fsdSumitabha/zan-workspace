import { NextRequest, NextResponse } from "next/server"
import { ACTIVE_REGION_COOKIE } from "@/lib/region-scope"
import { PUSH_DEVICE_COOKIE } from "@/constants/pushDevice"
import dbConnect from "@/lib/db/dbConnect"
import PushDevice from "@/models/PushDevice"

export async function POST(req: NextRequest) {
    try {
        // Stop push alerts on this browser. Without this, the old user's
        // alerts keep arriving here after they log out.
        await forgetPushDevice(req.cookies.get(PUSH_DEVICE_COOKIE)?.value)

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
        res.cookies.delete(PUSH_DEVICE_COOKIE)

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

// Best effort: a database problem must not block the logout.
async function forgetPushDevice(fid: string | undefined) {
    if (!fid) return
    try {
        await dbConnect()
        await PushDevice.deleteOne({ fid })
    } catch (error) {
        console.error("LOGOUT_PUSH_DEVICE_ERROR:", error)
    }
}