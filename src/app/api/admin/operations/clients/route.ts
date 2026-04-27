import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Client from "@/models/Client"
import { SortOrder } from "mongoose"
import { requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"

export async function GET(req: NextRequest) {
    try {

        await requireAuth(req)

        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get("page")) || 1
        const limit = Number(searchParams.get("limit")) || 10
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const sort = searchParams.get("sort") || "latest"

        const query: any = {}

        if (status) {
            query.status = Number(status)
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { company: { $regex: search, $options: "i" } }
            ]
        }

        const skip = (page - 1) * limit

        const sortOption: Record<string, SortOrder> =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 }

        const [data, total] = await Promise.all([
            Client.find(query)
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            Client.countDocuments(query)
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
            { success: false, message: "Failed to fetch clients" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        await requireRole(req, [10, 60])

        await dbConnect()

        const body = await req.json()

        if (!body.name || !body.company || !body.phone) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const existing = await Client.findOne({ phone: body.phone })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Phone already exists" },
                { status: 409 }
            )
        }

        const client = await Client.create(body)

        return NextResponse.json(
            { success: true, data: client },
            { status: 201 }
        )
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
            { success: false, message: "Failed to create client" },
            { status: 500 }
        )
    }
}