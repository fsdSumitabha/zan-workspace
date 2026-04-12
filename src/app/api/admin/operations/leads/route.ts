import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { SortOrder } from "mongoose"
import { Types } from "mongoose"

export async function GET(req: NextRequest) {
    try {
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
            query.name = { $regex: search, $options: "i" }
        }

        const skip = (page - 1) * limit

        const sortOption: Record<string, SortOrder> =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 }

        const [data, total] = await Promise.all([
            Lead.find(query)
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            Lead.countDocuments(query)
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
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: "Failed to fetch leads"
            },
            { status: 500 }
        )
    }
}


export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()

        if (!body.name || !body.phone || !body.source) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const existing = await Lead.findOne({ phone: body.phone })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Phone already exists" },
                { status: 409 }
            )
        }

        const lead = await Lead.create(body)

        return NextResponse.json(
            {
                success: true,
                data: lead
            },
            { status: 201 }
        )
    } catch {
        return NextResponse.json(
            { success: false, message: "Failed to create lead" },
            { status: 500 }
        )
    }
}


export async function DELETE(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const leadId = searchParams.get("leadId")

        // 1. Validate presence
        if (!leadId) {
            return NextResponse.json(
                { success: false, message: "leadId is required" },
                { status: 400 }
            )
        }

        // 2. Validate MongoDB ObjectId
        if (!Types.ObjectId.isValid(leadId)) {
            return NextResponse.json(
                { success: false, message: "Invalid leadId" },
                { status: 400 }
            )
        }

        // 3. Check existence
        const existingLead = await Lead.findById(leadId)

        if (!existingLead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        // 4. Delete
        await Lead.findByIdAndDelete(leadId)

        return NextResponse.json(
            {
                success: true,
                message: "Lead deleted successfully"
            },
            { status: 200 }
        )

    } catch (error) {
        console.error("DELETE LEAD ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}