import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import PushDevice from "@/models/PushDevice"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { PUSH_DEVICE_COOKIE, PUSH_PLATFORM } from "@/constants/pushDevice"

// A Firebase Installation ID is about 22 URL-safe characters.
const FID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/
// "1.4.0", "1.4.0+52", "2.0.0-beta.1"
const APP_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,40}$/
const PLATFORMS: number[] = Object.values(PUSH_PLATFORM)
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Saves this browser or phone for push notifications. Both call it on every
// visit or app start, so updatedAt shows when the device was last seen.
export async function POST(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const body = await req.json().catch(() => null)
        const fid = typeof body?.fid === "string" ? body.fid : ""
        if (!FID_PATTERN.test(fid)) {
            return NextResponse.json({ success: false, message: "Invalid device id" }, { status: 400 })
        }

        // A browser sends no platform. The phone app sends ANDROID or IOS.
        const platform = body?.platform ?? PUSH_PLATFORM.WEB
        if (!PLATFORMS.includes(platform)) {
            return NextResponse.json({ success: false, message: "Invalid platform" }, { status: 400 })
        }

        // One row per device. If another user signed in here before, the
        // device now belongs to the current user.
        const update: Record<string, unknown> = { user: new mongoose.Types.ObjectId(authUser.id), platform }
        // The version only helps support, so a bad one is dropped rather than refused.
        if (typeof body?.appVersion === "string" && APP_VERSION_PATTERN.test(body.appVersion)) {
            update.appVersion = body.appVersion
        }
        await PushDevice.updateOne({ fid }, { $set: update }, { upsert: true })

        const res = NextResponse.json({ success: true })
        // Only a browser gets the cookie. The phone app keeps its FID itself.
        if (platform === PUSH_PLATFORM.WEB) {
            res.cookies.set(PUSH_DEVICE_COOKIE, fid, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
                maxAge: ONE_YEAR_SECONDS,
            })
        }
        return res
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("PUSH_DEVICE_SAVE_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to save device" }, { status: 500 })
    }
}

// Stops push notifications on this device. A browser is found by its cookie.
// The phone app has no cookie, so it sends { fid } in the body. It must call
// this before it logs out, while it still holds the JWT.
export async function DELETE(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const body = await req.json().catch(() => null)
        const fid = typeof body?.fid === "string" ? body.fid : req.cookies.get(PUSH_DEVICE_COOKIE)?.value
        if (fid) {
            await PushDevice.deleteOne({ fid, user: new mongoose.Types.ObjectId(authUser.id) })
        }

        const res = NextResponse.json({ success: true })
        res.cookies.delete(PUSH_DEVICE_COOKIE)
        return res
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("PUSH_DEVICE_DELETE_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to remove device" }, { status: 500 })
    }
}
