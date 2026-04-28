import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Quotation from "@/models/Quotation"
import Interaction from "@/models/Interaction"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"

export async function POST(req: NextRequest) {
    try {
        requireRole(req, [10, 60])
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

        const title = formData.get("title") as string
        const description = formData.get("description") as string
        const amount = Number(formData.get("amount"))
        const gst_percentage = Number(formData.get("gst_percentage"))
        const status = Number(formData.get("status"))

        const file = formData.get("file") as File | null

        let fileUrl = ""

        // 1. Handle file upload
        // 1. Handle file upload
        if (file) {
            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            const uploadDir = path.join(process.cwd(), "public/uploads/quotations")

            // ensure folder exists
            await mkdir(uploadDir, { recursive: true })

            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")
            const fileName = `${Date.now()}-${safeName}`
            const filePath = path.join(uploadDir, fileName)

            await writeFile(filePath, buffer)

            fileUrl = `/uploads/quotations/${fileName}`
        }

        // 2. Create quotation
        const quotation = await Quotation.create({
            entityType,
            entityId,
            title,
            amount,
            gst_percentage,
            url: fileUrl,
            status
        })

        // 3. Create interaction
        const interaction = await Interaction.create({
            entityType,
            entityId,
            type: INTERACTION_TYPE.QUOTATION_SENT,
            title,
            description,
            status,
            refId: quotation._id
        })

        // 4. Prepare update payload
        const updatePayload = {
            lastInteractionAt: new Date(),
            lastInteractionId: interaction._id
        }

        // 5. Update corresponding entity
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
            { success: true, data: quotation },
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
            { success: false, error: "Failed to create quotation" },
            { status: 500 }
        )
    }
}