import { NextRequest, NextResponse } from "next/server"

import User from "@/models/User"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { normalizeTimeZone } from "@/lib/time/zone"

/**
 * POST /api/auth/timezone   { "timeZone": "Asia/Dubai" }
 *
 * Saves the zone of the browser on the signed-in account. The browser sends
 * it when it differs from the saved one (see AuthContext). Notifications read
 * it to write meeting times in this person's own zone.
 *
 * Only the caller's own row changes. `updateOne` does not run the audit
 * plugin, which watches `save`, so a zone change does not fill the activity
 * log every time someone travels.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth(req)

        const body = await req.json().catch(() => null)
        const timeZone = normalizeTimeZone(body?.timeZone)

        if (!timeZone) {
            return NextResponse.json(
                { success: false, message: "Unknown time zone.", field: "timeZone" },
                { status: 400 }
            )
        }

        if (user.timeZone !== timeZone) {
            // requireAuth has already connected and set the region scope. The
            // caller's own row holds every region in that scope, so the
            // scoped filter matches it.
            await User.updateOne({ _id: user.id }, { $set: { timeZone } })
        }

        return NextResponse.json({ success: true, data: { timeZone } })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("TIMEZONE_SAVE_ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Failed to save time zone" },
            { status: 500 }
        )
    }
}
