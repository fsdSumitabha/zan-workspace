import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import ActivityLog from "@/models/ActivityLog"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

/**
 * Returns metadata for activity-log filter UIs. Currently the distinct list
 * of `entityType` values that actually appear in the collection — so adding
 * a new audited model surfaces in the dropdown the moment its first row
 * lands, without anyone touching frontend constants.
 */
export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)
        await dbConnect()

        const raw = (await ActivityLog.distinct("entityType")) as Array<
            string | null
        >

        const entityTypes = raw
            .filter((v): v is string => typeof v === "string" && v.length > 0)
            .sort()

        return NextResponse.json({
            success: true,
            data: { entityTypes },
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("ACTIVITY_LOGS_META_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to load activity-log meta" },
            { status: 500 }
        )
    }
}
