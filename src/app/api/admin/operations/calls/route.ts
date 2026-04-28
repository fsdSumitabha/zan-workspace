import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import Call from "@/models/Call"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"

import path from "path"
import { writeFile, mkdir } from "fs/promises"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"


export async function POST(req: NextRequest) {
    try {
        await requireRole(req, [10, 60])

        await dbConnect()

        const formData = await req.formData()

        const entityType = Number(formData.get("entityType"))
        const entityId = formData.get("entityId") as string

        if (entityType === undefined || entityType === null || !entityId) {
            return NextResponse.json(
                { success: false, error: "entityType and entityId are required" },
                { status: 400 }
            )
        }

        const contactPersonName = formData.get("contactPersonName") as string
        const contactPersonPhone = formData.get("contactPersonPhone") as string

        const callTime = formData.get("callTime") as string
        const duration = Number(formData.get("duration"))

        const direction = Number(formData.get("direction"))
        const status = 2210

        const notes = formData.get("notes") as string
        const title = formData.get("title") as string

        const file = formData.get("recording") as File | null

        let recordingUrl: string | undefined

        // 1. Handle file upload
        if (file) {
            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            const uploadDir = path.join(process.cwd(), "public/uploads/calls")

            await mkdir(uploadDir, { recursive: true })

            const fileName = `${Date.now()}-${file.name}`
            const filePath = path.join(uploadDir, fileName)

            await writeFile(filePath, buffer)

            recordingUrl = `/uploads/calls/${fileName}`
        }

        // 2. Create Call document
        const call = await Call.create({
            entityType,
            entityId,
            contactPersonName,
            contactPersonPhone,
            callTime,
            duration,
            direction,
            status,
            notes,
            recordingUrl
        })

        // 3. Create Interaction (timeline entry)
        const interaction = await Interaction.create({
            entityType,
            entityId,
            type: INTERACTION_TYPE.CALL_MADE,
            title: title || `Call with ${contactPersonName}`,
            notes,
            refId: call._id
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
            { success: true, data: { call, interaction } },
            { status: 201 }
        )

    } catch (error : any) {
        console.error(error)
        
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, error: "Failed to create call" },
            { status: 500 }
        )
    }
}