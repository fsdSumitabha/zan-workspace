import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Project from "@/models/Project"
import "@/models/Client"
import { SortOrder } from "mongoose"

export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get("page")) || 1
        const limit = Number(searchParams.get("limit")) || 10
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const clientId = searchParams.get("clientId")
        const sort = searchParams.get("sort") || "latest"

        const query: any = {}

        if (status) {
            query.status = Number(status)
        }

        if (clientId) {
            query.clientId = clientId
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { companyName: { $regex: search, $options: "i" } }
            ]
        }

        const skip = (page - 1) * limit

        const sortOption: Record<string, SortOrder> =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 }

        const [data, total] = await Promise.all([
            Project.find(query)
                .populate("clientId", "name company") // useful for UI
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            Project.countDocuments(query)
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
    } catch {
        return NextResponse.json(
            { success: false, message: "Failed to fetch projects" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()

        if (!body.clientId || !body.title) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const project = await Project.create(body)

        return NextResponse.json(
            { success: true, data: project },
            { status: 201 }
        )
    } catch {
        return NextResponse.json(
            { success: false, message: "Failed to create project" },
            { status: 500 }
        )
    }
}