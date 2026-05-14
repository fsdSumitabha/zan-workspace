import path from "path"
import fs from "fs/promises"
import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { verifyToken } from "@/lib/auth/verifyToken"

const AVATARS_PUBLIC_PREFIX = "/uploads/avatars/"

function safeAvatarDiskPath(publicUrl: string): string | null {
    if (!publicUrl || !publicUrl.startsWith(AVATARS_PUBLIC_PREFIX)) {
        return null
    }

    const relative = publicUrl.replace(/^\//, "")
    const avatarsRoot = path.resolve(
        process.cwd(),
        "public",
        "uploads",
        "avatars"
    )
    const resolved = path.resolve(process.cwd(), "public", relative)

    if (!resolved.startsWith(avatarsRoot)) {
        return null
    }

    return resolved
}

export async function POST(req: NextRequest) {
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

        const formData = await req.formData()
        const file = formData.get("avatarFile") as File | null

        if (!file || file.size === 0) {
            return NextResponse.json(
                { success: false, message: "No image file provided" },
                { status: 400 }
            )
        }

        if (!["image/jpeg", "image/png"].includes(file.type)) {
            return NextResponse.json(
                { success: false, message: "Invalid file type (JPEG or PNG only)" },
                { status: 415 }
            )
        }

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json(
                { success: false, message: "File too large (max 5MB)" },
                { status: 413 }
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

        const oldDiskPath = user.avatar
            ? safeAvatarDiskPath(user.avatar)
            : null

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const fileName = `${Date.now()}-${file.name.replace(/\s/g, "")}`

        const uploadDir = path.join(process.cwd(), "public/uploads/avatars")

        await fs.mkdir(uploadDir, { recursive: true })

        const filePath = path.join(uploadDir, fileName)

        await fs.writeFile(filePath, buffer)

        const avatarUrl = `${AVATARS_PUBLIC_PREFIX}${fileName}`

        user.avatar = avatarUrl
        await user.save()

        if (oldDiskPath) {
            try {
                await fs.unlink(oldDiskPath)
            } catch {
                // ignore missing or permission errors
            }
        }

        return NextResponse.json({
            success: true,
            message: "Avatar updated successfully",
            data: {
                avatar: user.avatar
            }
        })
    } catch (error) {
        console.error("AUTH_PROFILE_AVATAR_ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}
