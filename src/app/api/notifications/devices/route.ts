import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import PushDevice from "@/models/PushDevice"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { PUSH_DEVICE_COOKIE } from "@/constants/pushDevice"

// A Firebase Installation ID is about 22 URL-safe characters.
const FID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Saves this browser for push notifications. The browser calls it on every
// visit, so updatedAt shows when it was last seen.
export async function POST(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const body = await req.json().catch(() => null)
        const fid = typeof body?.fid === "string" ? body.fid : ""
        if (!FID_PATTERN.test(fid)) {
            return NextResponse.json({ success: false, message: "Invalid device id" }, { status: 400 })
        }

        // One row per browser. If another user signed in here before, the
        // browser now belongs to the current user.
        await PushDevice.updateOne(
            { fid },
            { $set: { user: new mongoose.Types.ObjectId(authUser.id) } },
            { upsert: true }
        )

        const res = NextResponse.json({ success: true })
        res.cookies.set(PUSH_DEVICE_COOKIE, fid, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: ONE_YEAR_SECONDS,
        })
        return res
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        console.error("PUSH_DEVICE_SAVE_ERROR:", err)
        return NextResponse.json({ success: false, message: "Failed to save device" }, { status: 500 })
    }
}

// Stops push notifications on this browser.
export async function DELETE(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const fid = req.cookies.get(PUSH_DEVICE_COOKIE)?.value
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
