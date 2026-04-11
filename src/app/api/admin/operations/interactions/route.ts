import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"

export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "10")

        const skip = (page - 1) * limit

        const interactions = await Interaction.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await Interaction.countDocuments()

        return NextResponse.json({
            success: true,
            data: interactions,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        })

    } catch (error) {
        console.error("GET INTERACTIONS PAGINATION ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Failed to fetch interactions" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            type,
            title,
            description,
            createdBy
        } = body

        const interaction = await Interaction.create({
            entityType,
            entityId,
            type,
            title,
            description,
            createdBy
        })

        return NextResponse.json({
            success: true,
            interaction
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to create interaction" },
            { status: 500 }
        )
    }
}