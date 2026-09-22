import bcrypt from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { SortOrder } from "mongoose"
import { requireRole } from "@/lib/auth/requireRole"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import {
    USER_ROLE_META,
    UserRole,
    canAdministerAllRegions,
} from "@/constants/userRoles"
import { auditedCreate } from "@/lib/activity-log"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import {
    runWithoutRegionScope,
    runWithoutRegionScopeIf,
} from "@/lib/region-scope"
import { parseRegionsInput, resolveGrantedRegions, RegionChoiceError, } from "@/lib/region-scope/regionGrant"

import { imagekit } from "@/lib/imagekit/imagekit"

import { getBaseUrl } from "@/lib/urls/getBaseUrl"
import { sendRegistrationMail } from "@/services/registrationMail"

export async function GET(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 15, 20, 69])

        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get("page")) || 1
        const limit = Number(searchParams.get("limit")) || 10

        const role = searchParams.get("role")
        const isActive = searchParams.get("isActive")
        const search = searchParams.get("search")
        const sort = searchParams.get("sort") || "latest"

        const query: any = {}

        // role filter
        if (role) {
            query.role = Number(role)
        }

        // active filter
        if (isActive !== null) {
            query.isActive = isActive === "true"
        }

        // search (name + email)
        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            query.$or = [
                { name: re },
                { email: re },
            ]
        }

        const skip = (page - 1) * limit

        const sortOption: Record<string, SortOrder> =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 }

        // HR and admin administer accounts in every region, so the list and
        // its total leave the region scope for them. Everyone else stays
        // scoped, which is why the count has to use the same wrapper as the
        // rows: a scoped list with an unscoped total would show 0 of 12.
        const crossRegion = canAdministerAllRegions(authUser.role)

        const [data, total] = await Promise.all([
            runWithoutRegionScopeIf(crossRegion, () =>
                User.find(query)
                    .select("-password")
                    .populate("createdBy", "name email role")
                    .sort(sortOption)
                    .skip(skip)
                    .limit(limit)
                    .lean()
            ),

            runWithoutRegionScopeIf(crossRegion, () =>
                User.countDocuments(query)
            )
        ])

        return NextResponse.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        })
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                {
                    success: false,
                    message: error.message
                },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            {
                success: false,
                message: "Failed to fetch users"
            },
            { status: 500 }
        )
    }
}


export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 20, 69])

        await dbConnect()

        const formData = await req.formData()

        const name = formData.get("name")?.toString().trim()
        const email = formData.get("email")?.toString().toLowerCase().trim()
        const password = formData.get("password")?.toString()
        const role = Number(formData.get("role"))
        const isActive = formData.get("isActive") === "true"

        const submittedRegions = parseRegionsInput(formData.getAll("regions"))

        const file = formData.get("avatarFile") as File | null

        if (!name || !email || !password) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        if (!(role in USER_ROLE_META)) {
            return NextResponse.json(
                { success: false, message: "Invalid role" },
                { status: 400 }
            )
        }

        // One rule for create and edit. See src/lib/region-scope/regionGrant.ts.
        const regions = resolveGrantedRegions({
            submitted: submittedRegions,
            granter: authUser.regions,
            granterRole: authUser.role,
        })

        if (password.length < 6) {
            return NextResponse.json(
                { success: false, message: "Password must be at least 6 characters" },
                { status: 400 }
            )
        }

        // Outside the region scope. The unique index on email is global,
        // so a scoped check would miss a user in another region and the
        // insert would then fail with a driver error instead of a clean
        // 409. Only the existence of the row is used, nothing is returned.
        const existingUser = await runWithoutRegionScope(() =>
            User.findOne({ email }).select("_id")
        )

        if (existingUser) {
            return NextResponse.json(
                { success: false, message: "Email already exists" },
                { status: 409 }
            )
        }

        let avatarUrl = ""

        if (file && file.size > 0) {
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
                tags: ["avatar", `role:${role}`],
            })

            avatarUrl = uploadResponse.url
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await auditedCreate(
            User,
            ENTITY_TYPE.USER,
            {
                name,
                email,
                password: hashedPassword,
                role,
                regions,
                isActive,
                avatar: avatarUrl,
                createdBy: authUser.id,
            },
            authUser.id
        )

        
        try {
            await sendRegistrationMail({
                name: user.name,
                email: user.email,
                password : password,
                roleLabel: USER_ROLE_META[role as UserRole].label,
                baseUrl: getBaseUrl(req),
                createdByName: authUser.name,
                createdByEmail: authUser.email,
            })
        } catch (mailError) {
            // user is already created — log and continue
            console.error("Failed to send registration emails:", mailError)
        }
        

        return NextResponse.json(
            {
                success: true,
                data: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive,
                    avatar: user.avatar
                }
            },
            { status: 201 }
        )
    } catch (error: any) {
        if (error instanceof RegionChoiceError) {
            return NextResponse.json(
                { success: false, message: error.message, field: error.field },
                { status: error.statusCode }
            )
        }
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("Create user error:", error)

        return NextResponse.json(
            { success: false, message: "Failed to create user" },
            { status: 500 }
        )
    }
}