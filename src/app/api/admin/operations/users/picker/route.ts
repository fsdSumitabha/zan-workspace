import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { escapeRegex } from "@/lib/search/escapeRegex"

export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const search = searchParams.get("search")?.trim()
        const limit = Math.min(
            Math.max(Number(searchParams.get("limit")) || 50, 1),
            50
        )

        const query: Record<string, unknown> = { isActive: true }

        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            query.$or = [{ name: re }, { email: re }]
        }

        const users = await User.find(query)
            .select("_id name email role avatar")
            .sort({ name: 1 })
            .limit(limit)
            .lean()

        return NextResponse.json({ success: true, data: users })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("USERS_PICKER_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to load users" },
            { status: 500 }
        )
    }
}
