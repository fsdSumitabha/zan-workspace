import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { requireRole } from "@/lib/auth/requireRole"
import bcrypt from "bcryptjs"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedFindByIdAndUpdate } from "@/lib/activity-log"
import { USER_ROLE_META, UserRole } from "@/constants/userRoles"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { imagekit } from "@/lib/imagekit/imagekit"


export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, [10, 20])

        await dbConnect()

        const { id } = await params

        if (!mongoose.isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid user id" },
                { status: 400 }
            )
        }

        const user = await User.findById(id).select("-password").lean()

        if (!user) {
            return NextResponse.json(
                { success: false, message: "User not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({ success: true, data: user }, { status: 200 })
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("Get user error:", error)

        return NextResponse.json(
            { success: false, message: "Failed to load user" },
            { status: 500 }
        )
    }
}


export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }   // Next 14: { params: { id: string } } (no await)
) {
    try {
        const authUser = await requireRole(req, [10, 20])

        await dbConnect()

        const { id } = await params

        if (!mongoose.isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid user id" },
                { status: 400 }
            )
        }

        const targetUser = await User.findById(id)

        if (!targetUser) {
            return NextResponse.json(
                { success: false, message: "User not found" },
                { status: 404 }
            )
        }

        const formData = await req.formData()

        // A field is only touched if the client actually sent it -> partial update
        const sent = (key: string) => formData.get(key) !== null

        const updates: Record<string, any> = {}

        /* ---------------------------------- name --------------------------------- */

        if (sent("name")) {
            const name = formData.get("name")!.toString().trim()

            if (!name) {
                return NextResponse.json(
                    { success: false, message: "Name cannot be empty" },
                    { status: 400 }
                )
            }

            updates.name = name
        }

        /* --------------------------------- email --------------------------------- */

        if (sent("email")) {
            const email = formData.get("email")!.toString().toLowerCase().trim()

            if (!email) {
                return NextResponse.json(
                    { success: false, message: "Email cannot be empty" },
                    { status: 400 }
                )
            }

            if (email !== targetUser.email) {
                const existingUser = await User.findOne({ email, _id: { $ne: id } })

                if (existingUser) {
                    return NextResponse.json(
                        { success: false, message: "Email already exists" },
                        { status: 409 }
                    )
                }

                updates.email = email
            }
        }

        /* -------------------------------- password -------------------------------- */
        // Empty string = "leave the password alone" (edit forms usually post an empty field)

        let newPassword: string | undefined

        if (sent("password")) {
            const password = formData.get("password")!.toString()

            if (password.length > 0) {
                if (password.length < 6) {
                    return NextResponse.json(
                        { success: false, message: "Password must be at least 6 characters" },
                        { status: 400 }
                    )
                }

                newPassword = password
                updates.password = await bcrypt.hash(password, 10)
            }
        }

        /* ---------------------------------- role ---------------------------------- */

        if (sent("role")) {
            const role = Number(formData.get("role"))

            if (!(role in USER_ROLE_META)) {
                return NextResponse.json(
                    { success: false, message: "Invalid role" },
                    { status: 400 }
                )
            }

            if (String(targetUser._id) === String(authUser.id) && role !== targetUser.role) {
                return NextResponse.json(
                    { success: false, message: "You cannot change your own role" },
                    { status: 403 }
                )
            }

            updates.role = role
        }

        /* -------------------------------- isActive -------------------------------- */

        if (sent("isActive")) {
            const isActive = formData.get("isActive") === "true"

            if (String(targetUser._id) === String(authUser.id) && !isActive) {
                return NextResponse.json(
                    { success: false, message: "You cannot deactivate your own account" },
                    { status: 403 }
                )
            }

            updates.isActive = isActive
        }

        /* --------------------------------- avatar --------------------------------- */

        const file = formData.get("avatarFile") as File | null
        const removeAvatar = formData.get("removeAvatar") === "true"

        if (file && typeof file !== "string" && file.size > 0) {
            if (!["image/jpeg", "image/png"].includes(file.type)) {
                return NextResponse.json(
                    { success: false, message: "Invalid file type" },
                    { status: 415 }
                )
            }

            if (file.size > 5 * 1024 * 1024) {
                return NextResponse.json(
                    { success: false, message: "File too large (max 5MB)" },
                    { status: 413 }
                )
            }

            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            const uploadResponse = await imagekit.upload({
                file: buffer,
                fileName: `${Date.now()}-${file.name.replace(/\s/g, "")}`,
                folder: "/avatars",
                useUniqueFileName: true,
                tags: ["avatar", `role:${updates.role ?? targetUser.role}`],
            })

            updates.avatar = uploadResponse.url
        } else if (removeAvatar) {
            updates.avatar = ""
        }

        /* --------------------------------- persist -------------------------------- */

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { success: false, message: "Nothing to update" },
                { status: 400 }
            )
        }

        const user = await auditedFindByIdAndUpdate(
            User,
            ENTITY_TYPE.USER,
            id,
            {
                ...updates,
                updatedBy: authUser.id,
            },
            { new: true, runValidators: true },
            authUser.id
        )

        if (!user) {
            return NextResponse.json(
                { success: false, message: "User not found" },
                { status: 404 }
            )
        }

        /* ------------------------ optional: credentials mail ----------------------- */
        // Mirrors the create flow — only makes sense if an admin reset someone's password.
        //
        // if (newPassword) {
        //     try {
        //         await sendCredentialsUpdatedMail({
        //             name: user.name,
        //             email: user.email,
        //             password: newPassword,
        //             roleLabel: USER_ROLE_META[user.role as UserRole].label,
        //             baseUrl: getBaseUrl(req),
        //             updatedByName: authUser.name,
        //             updatedByEmail: authUser.email,
        //         })
        //     } catch (mailError) {
        //         console.error("Failed to send credentials update email:", mailError)
        //     }
        // }

        return NextResponse.json(
            {
                success: true,
                data: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive,
                    avatar: user.avatar,
                },
            },
            { status: 200 }
        )
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("Update user error:", error)

        return NextResponse.json(
            { success: false, message: "Failed to update user" },
            { status: 500 }
        )
    }
}