import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params

        await dbConnect()

        const lead = await Lead.findById(id)

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: lead
        })
    } catch {
        return NextResponse.json(
            { success: false, message: "Invalid ID" },
            { status: 400 }
        )
    }
}


export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params
        await dbConnect()

        const body = await req.json()

        const lead = await Lead.findByIdAndUpdate(
            id,
            body,
            { new: true }
        )

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: lead
        })
    } catch {
        return NextResponse.json(
            { success: false, message: "Update failed" },
            { status: 400 }
        )
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params

        await dbConnect()

        const lead = await Lead.findByIdAndDelete(id)

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            message: "Lead deleted"
        })
    } catch {
        return NextResponse.json(
            { success: false, message: "Delete failed" },
            { status: 400 }
        )
    }
}