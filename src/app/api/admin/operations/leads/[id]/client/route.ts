import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Was missing. Without it there is no region context, so every
        // query below is denied, and before regions this route was
        // readable by anyone. Role gating is left to the parent resource;
        // the region filter does the data scoping.
        await requireAuth(req)

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
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        )
    }
}