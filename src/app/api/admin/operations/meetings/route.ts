import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"

export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)

        // Pagination params
        const page = Math.max(parseInt(searchParams.get("page") || "1"), 1)
        const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10"), 1), 100)
        const skip = (page - 1) * limit

        // Optional filters
        const entityType = searchParams.get("entityType")
        const entityId = searchParams.get("entityId")
        const status = searchParams.get("status")

        const query: any = {}

        if (entityType !== null) query.entityType = Number(entityType)
        if (entityId) query.entityId = entityId
        if (status !== null) query.status = Number(status)

        // Fetch data + total count in parallel
        const [meetings, total] = await Promise.all([
            Meeting.find(query)
                .sort({ scheduledAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            Meeting.countDocuments(query)
        ])

        // Edge case: page exceeds total data
        if (page > 1 && meetings.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Page out of range"
                },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {
                success: true,
                data: meetings,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page * limit < total,
                    hasPrevPage: page > 1
                }
            },
            { status: 200 }
        )

    } catch (error: any) {
        console.error("GET MEETINGS ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            meetingLink,
            scheduledAt,
            status
        } = body

        if (!entityType || !entityId) {
            return NextResponse.json(
                { success: false, error: "entityType and entityId are required" },
                { status: 400 }
            )
        }

        // 1. Create Meeting
        const meeting = await Meeting.create({
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            meetingLink,
            scheduledAt,
            status
        })

        // 2. Create Interaction (timeline entry)
        const interaction = await Interaction.create({
            entityType,
            entityId,
            type: INTERACTION_TYPE.MEETING_SCHEDULED,
            title: title,
            description: agenda,
            refId: meeting._id
        })

        // 2. Prepare update payload
        const updatePayload = {
            lastInteractionAt: new Date(),
            lastInteractionId: interaction._id
        }

        // 3. Update corresponding entity
        switch (entityType) {
            case ENTITY_TYPE.LEAD:
                await Lead.findByIdAndUpdate(entityId, updatePayload)
                break

            case ENTITY_TYPE.CLIENT:
                await Client.findByIdAndUpdate(entityId, updatePayload)
                break

            case ENTITY_TYPE.PROJECT:
                await Project.findByIdAndUpdate(entityId, updatePayload)
                break

            default:
                return NextResponse.json(
                    { success: false, error: "Invalid entityType" },
                    { status: 400 }
                )
        }

        return NextResponse.json(
            { success: true, data: meeting },
            { status: 201 }
        )
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create meeting" },
            { status: 500 }
        )
    }
}