import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Client from "@/models/Client"
import Project from "@/models/Project"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
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

        return NextResponse.json({
            success: true,
            data: {
                client,
                projects
            }
        })
    } catch (error) {
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
        await dbConnect()

        const { id } = await context.params
        const body = await req.json()

        const client = await Client.findByIdAndUpdate(
            id,
            body,
            { new: true }
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
        await dbConnect()

        const { id } = await context.params

        const client = await Client.findByIdAndDelete(id)

        if (!client) {
            return NextResponse.json(
                { success: false, message: "Client not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            message: "Client deleted"
        })
    } catch {
        return NextResponse.json(
            { success: false, message: "Delete failed" },
            { status: 400 }
        )
    }
}