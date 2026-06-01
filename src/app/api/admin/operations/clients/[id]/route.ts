import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Client from "@/models/Client"
import Project from "@/models/Project"
import Lead from "@/models/Lead"
import { Types } from "mongoose"
import { requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedFindByIdAndUpdate } from "@/lib/activity-log"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, [10, 60, 70, 45, 50])

        await dbConnect()

        const { id } = await context.params

        // Fetch client
        const client = await Client.findById(id)

        if (!client) {
            return NextResponse.json(
                { success: false, message: "Client not found" },
                { status: 404 }
            )
        }

        // Fetch projects linked to this client
        const projects = await Project.find({ clientId: id })
            .sort({ createdAt: -1 }) // optional: latest first

        // Fetch lead linked to this client
        const lead = await Lead.findById(client.leadId)

        return NextResponse.json({
            success: true,
            data: {
                client,
                lead: lead || null,
                projects
            }
        })
    } catch (error : any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 401 }
            )
        }
        return NextResponse.json(
            {
                success: false,
                message: "Invalid ID",
                error: (error as Error).message
            },
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
                { success: false, message: "Invalid client ID" },
                { status: 400 }
            )
        }

        const body = await req.json()

        if (!body.name || !body.company || !body.phone) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        await dbConnect()

        const user = await requireRole(req, [10, 60, 70, 45])

        const existing = await Client.findOne({
            phone: body.phone,
            _id: { $ne: id }
        })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Phone already exists" },
                { status: 409 }
            )
        }

        const { name, company, email, phone } = body

        const client = await auditedFindByIdAndUpdate(
            Client,
            "CLIENT",
            id,
            { name, company, email, phone },
            {},
            user.id
        )

        if (!client) {
            return NextResponse.json(
                { success: false, message: "Client not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: client
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
            { success: false, message: "Failed to update client" },
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
                { success: false, message: "Invalid client ID" },
                { status: 400 }
            )
        }

        await dbConnect()

        await requireRole(req, [10, 45])

        // 2. Delete lead
        const lead = await Client.findByIdAndDelete(id)

        // 3. Not found
        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Client not found" },
                { status: 404 }
            )
        }

        // 4. Success
        return NextResponse.json(
            {
                success: true,
                message: "Client deleted successfully"
            },
            { status: 200 }
        )

    } catch (error) {
        console.error("DELETE CLIENT ERROR:", error)

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