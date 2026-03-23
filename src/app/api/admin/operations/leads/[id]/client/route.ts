import { NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Client from "@/models/Client"

export async function GET(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        const params = await context.params
        const lead = await Lead.findById(params.id)

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        if (!lead.convertedClientId) {
            return NextResponse.json({
                success: true,
                data: null
            })
        }

        const client = await Client.findById(lead.convertedClientId)

        return NextResponse.json({
            success: true,
            data: client
        })

    } catch (error) {
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        )
    }
}