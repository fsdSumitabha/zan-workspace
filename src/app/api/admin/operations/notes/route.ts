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
            title,
            description,
            status
        } = body


        // 1. Create Interaction (timeline entry)
        const note = await Interaction.create({
            entityType,
            entityId,
            type: 2110,
            title: title,
            description: description,
        })

        return NextResponse.json(
            { success: true, data: note },
            { status: 201 }
        )
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create note" },
            { status: 500 }
        )
    }
}