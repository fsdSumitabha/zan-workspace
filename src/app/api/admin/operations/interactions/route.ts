import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"

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