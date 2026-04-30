import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { SortOrder } from "mongoose"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"

export async function GET(req: NextRequest) {
    try {
        await requireRole(req, [10, 20])

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
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ]
        }

        const skip = (page - 1) * limit

        const sortOption: Record<string, SortOrder> =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 }

        const [data, total] = await Promise.all([
            User.find(query)
                .select("-password")
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            User.countDocuments(query)
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