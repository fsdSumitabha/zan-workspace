import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Project from "@/models/Project"
import { Types } from "mongoose"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedFindByIdAndUpdate } from "@/lib/activity-log"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, [10, 60, 70, 45, 50])

        await dbConnect()

        const { id } = await context.params

        const project = await Project.findById(id)
            .populate("clientId", "name company phone")

        if (!project) {
            return NextResponse.json(
                { success: false, message: "Project not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: project
        })
    } catch(error : any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
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
                { success: false, message: "Invalid project ID" },
                { status: 400 }
            )
        }

        const body = await req.json()

        if (!body.clientId || !body.title) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        if (!Types.ObjectId.isValid(body.clientId)) {
            return NextResponse.json(
                { success: false, message: "Invalid client ID" },
                { status: 400 }
            )
        }

        await dbConnect()
        const user = await requireRole(req, [10, 60, 45, 70])

        const { clientId, title, description, serviceType, status, companyName, budget } =
            body

        const update: Record<string, unknown> = {
            clientId,
            title,
            description,
            serviceType,
            status,
            budget
        }

        if (companyName !== undefined) {
            update.companyName = companyName
        }

        if (budget !== undefined && budget !== null && budget !== "") {
            const n = Number(budget)
            if (!Number.isNaN(n)) {
                update.budget = n
            }
        }

        const project = await auditedFindByIdAndUpdate(
            Project,
            ENTITY_TYPE.PROJECT,
            id,
            update,
            {},
            user.id
        )

        if (!project) {
            return NextResponse.json(
                { success: false, message: "Project not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: project
        })
    } catch(error : any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, message: "Failed to update project" },
            { status: 500 }
        )
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, [10, 60, 45, 70])

        const { id } = await context.params

        // 1. Validate ID
        if (!id || !Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid project ID" },
                { status: 400 }
            )
        }

        await dbConnect()

        // 2. Delete lead
        const lead = await Project.findByIdAndDelete(id)

        // 3. Not found
        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Project not found" },
                { status: 404 }
            )
        }

        // 4. Success
        return NextResponse.json(
            {
                success: true,
                message: "Project deleted successfully"
            },
            { status: 200 }
        )

    } catch (error : any) {
        console.error("DELETE PROJECT ERROR:", error)
        
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