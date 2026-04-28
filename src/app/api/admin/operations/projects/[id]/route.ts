import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Project from "@/models/Project"
import { Types } from "mongoose"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireAuth(req)

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
        await requireRole(req, [10, 60])

        await dbConnect()

        const { id } = await context.params
        const body = await req.json()

        const project = await Project.findByIdAndUpdate(
            id,
            body,
            { new: true }
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
        await requireRole(req, [10, 60])

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