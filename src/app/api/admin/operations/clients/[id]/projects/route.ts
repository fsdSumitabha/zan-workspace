import { NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Project from "@/models/Project"
import Client from "@/models/Client"

export async function GET(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        // get params using await (important)
        const { id } = await context.params

        // validate id
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid client ID" },
                { status: 400 }
            )
        }

        // check if client exists
        const client = await Client.findById(id)

        if (!client) {
            return NextResponse.json(
                { success: false, message: "Client not found" },
                { status: 404 }
            )
        }

        // fetch projects
        const projects = await Project.find({ clientId: id })
            .sort({ createdAt: -1 })

        return NextResponse.json(
            {
                success: true,
                data: projects
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("GET CLIENT PROJECTS ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal Server Error"
            },
            { status: 500 }
        )
    }
}