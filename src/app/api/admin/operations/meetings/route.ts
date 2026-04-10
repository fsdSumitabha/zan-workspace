import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"

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