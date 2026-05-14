import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { verifyToken } from "@/lib/auth/verifyToken"

export async function PATCH(req: NextRequest) {
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
            userId = (await verifyToken(token)).userId
        } catch {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            )
        }

        const body = await req.json().catch(() => null)

        const oldPassword = body?.oldPassword ?? body?.currentPassword
        const newPasswordRaw = body?.newPassword

        if (!oldPassword || !newPasswordRaw) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Old password and new password are required"
                },
                { status: 400 }
            )
        }

        const newPassword = String(newPasswordRaw)

        if (newPassword.length < 6) {
            return NextResponse.json(
                {
                    success: false,
                    message: "New password must be at least 6 characters"
                },
                { status: 400 }
            )
        }

        await dbConnect()

        const user = await User.findById(userId)

        if (!user || !user.isActive) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            )
        }

        const match = await bcrypt.compare(String(oldPassword), user.password)

        if (!match) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Old password is incorrect"
                },
                { status: 401 }
            )
        }

        user.password = await bcrypt.hash(newPassword, 10)
        await user.save()

        return NextResponse.json({
            success: true,
            message: "Password updated successfully"
        })
    } catch (error) {
        console.error("AUTH_PROFILE_PASSWORD_ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}
