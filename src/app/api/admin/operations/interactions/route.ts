import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import { auditedCreate } from "@/lib/activity-log"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"

export async function GET(req: NextRequest) {
    try {
        // Was missing. Without it there is no region context, so every
        // query below is denied, and before regions this route was
        // readable by anyone. Role gating is left to the parent resource;
        // the region filter does the data scoping.
        await requireAuth(req)

        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "10")

        const skip = (page - 1) * limit

        const interactions = await Interaction.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await Interaction.countDocuments()

        return NextResponse.json({
            success: true,
            data: interactions,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        })

    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("GET INTERACTIONS PAGINATION ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Failed to fetch interactions" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        // Was missing. Without it there is no region context, so every
        // query below is denied, and before regions this route was
        // readable by anyone. Role gating is left to the parent resource;
        // the region filter does the data scoping.
        const authUser = await requireAuth(req)

        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            type,
            title,
            description
        } = body

        // createdBy used to come from the request body, so a caller could
        // write a timeline entry as anybody. It comes from the verified
        // token now and the body value is ignored.
        const createdBy = authUser.id

        const interaction = await auditedCreate(
            Interaction,
            4,
            {
                entityType,
                entityId,
                type,
                title,
                description,
                createdBy
            },
            createdBy
        )

        return NextResponse.json({
            success: true,
            interaction
        })

    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to create interaction" },
            { status: 500 }
        )
    }
}