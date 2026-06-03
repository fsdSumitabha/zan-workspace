import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import { Types } from "mongoose"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedFindByIdAndUpdate } from "@/lib/activity-log"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params

        await dbConnect()
        await requireRole(req, [10, 60, 70, 45])

        const lead = await Lead.findById(id)

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        // If this lead has been converted, also return the resulting
        // client so the UI can render a "Converted to Client" panel
        // with a link — mirrors what the client GET does for `lead`.
        const client = lead.convertedClientId
            ? await Client.findById(lead.convertedClientId)
            : null

        return NextResponse.json({
            success: true,
            data: {
                lead,
                client: client || null,
            },
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
        if (!id || !Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid lead ID" },
                { status: 400 }
            )
        }

        const body = await req.json()

        if (!body.name || !body.phone || !body.source) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        await dbConnect()
        const user = await requireRole(req, [10, 60, 70, 45])

        const existing = await Lead.findOne({
            phone: body.phone,
            _id: { $ne: id }
        })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Phone already exists" },
                { status: 409 }
            )
        }

        const { name, email, phone, source } = body

        const lead = await auditedFindByIdAndUpdate(
            Lead,
            0,
            id,
            { name, email, phone, source },
            {},
            user.id
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
            { success: false, message: "Failed to update lead" },
            { status: 500 }
        )
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params

        // 1. Validate ID
        if (!id || !Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid lead ID" },
                { status: 400 }
            )
        }

        await dbConnect()
        const authUser = await requireRole(req, [10, 45])

        const lead = await auditedFindByIdAndUpdate(
            Lead,
            0,
            id,
            {
                deletedAt: new Date(),
                deletedBy: authUser.id,
            },
            {},
            authUser.id
        )

        // 3. Not found (or already deleted)
        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found or already deleted" },
                { status: 404 }
            )
        }

        // 4. Success
        return NextResponse.json(
            {
                success: true,
                message: "Lead deleted successfully"
            },
            { status: 200 }
        )

    } catch (error: any) {
        console.error("DELETE LEAD ERROR:", error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}