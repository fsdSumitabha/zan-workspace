import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { verifyToken } from "@/lib/auth/verifyToken"
import { imagekit } from "@/lib/imagekit/imagekit"

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

        // remember the old fileId so we can delete it after the new upload succeeds
        const oldFileId = user.avatarFileId || null

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const uploadResponse = await imagekit.upload({
            file: buffer,
            fileName: `${Date.now()}-${file.name.replace(/\s/g, "")}`,
            folder: "/avatars",
            useUniqueFileName: true,
            tags: ["avatar", `user:${user._id}`]
        })

        user.avatar = uploadResponse.url
        user.avatarFileId = uploadResponse.fileId
        await user.save()

        // best-effort cleanup of the previous avatar — don't fail the request if this fails
        if (oldFileId) {
            try {
                await imagekit.deleteFile(oldFileId)
            } catch (err) {
                console.warn("Failed to delete old avatar from ImageKit:", err)
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