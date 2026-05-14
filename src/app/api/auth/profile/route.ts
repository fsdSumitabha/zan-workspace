import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { verifyToken } from "@/lib/auth/verifyToken"

type PopulatedCreatedBy = {
    _id: unknown
    name?: string
    email?: string
    role?: number
}

export async function GET(req: NextRequest) {
    try {
        const token = req.cookies.get("auth_token")?.value

        if (!token) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            )
        }

        let userId: string

        try {
            const payload = await verifyToken(token)
            userId = payload.userId
        } catch {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            )
        }

        await dbConnect()

        const user = await User.findById(userId)
            .select("-password")
            .populate("createdBy", "name email role")
            .lean()

        if (!user || !user.isActive) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            )
        }

        let createdBy: {
            id: string
            name?: string
            email?: string
            role?: number
        } | null = null

        const rawCreatedBy = user.createdBy as PopulatedCreatedBy | undefined

        if (
            rawCreatedBy &&
            typeof rawCreatedBy === "object" &&
            "_id" in rawCreatedBy
        ) {
            createdBy = {
                id: String(rawCreatedBy._id),
                name: rawCreatedBy.name,
                email: rawCreatedBy.email,
                role: rawCreatedBy.role
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                id: String(user._id),
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                avatar: user.avatar || "",
                lastLoginAt: user.lastLoginAt
                    ? new Date(user.lastLoginAt).toISOString()
                    : null,
                createdAt: user.createdAt
                    ? new Date(user.createdAt).toISOString()
                    : null,
                updatedAt: user.updatedAt
                    ? new Date(user.updatedAt).toISOString()
                    : null,
                createdBy
            }
        })
    } catch (error) {
        console.error("AUTH_PROFILE_ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}
