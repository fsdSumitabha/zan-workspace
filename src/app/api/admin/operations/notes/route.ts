import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            title,
            description,
            status
        } = body

        if (entityType === undefined || entityType === null || !entityId) {
            return NextResponse.json(
                { success: false, error: "entityType and entityId are required" },
                { status: 400 }
            )
        }

        // 1. Create Interaction (timeline entry)
        const note = await Interaction.create({
            entityType,
            entityId,
            type: INTERACTION_TYPE.NOTE_ADDED,
            title,
            description,
        })

        // 2. Prepare update payload
        const updatePayload = {
            lastInteractionAt: new Date(),
            lastInteractionId: note._id
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
            { success: true, data: note },
            { status: 201 }
        )
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create note" },
            { status: 500 }
        )
    }
}