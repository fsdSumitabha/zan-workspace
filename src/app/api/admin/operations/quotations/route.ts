import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Quotation from "@/models/Quotation"
import Interaction from "@/models/Interaction"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedUpdateByNumericEntityType } from "@/lib/activity-log"
import { imagekit } from "@/lib/imagekit/imagekit"


export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 60, 70, 45])
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
        if (file && file.size > 0) {
            const allowedTypes = [
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ]
            const allowedExtensions = [".pdf", ".doc", ".docx"]

            const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
            const typeOk = allowedTypes.includes(file.type)
            const extOk = allowedExtensions.includes(ext)

            if (!typeOk && !extOk) {
                return NextResponse.json(
                    { success: false, error: "Invalid file type (PDF, DOC or DOCX only)" },
                    { status: 415 }
                )
            }

            // Free plan ceiling for raw/image files is 20MB
            if (file.size > 20 * 1024 * 1024) {
                return NextResponse.json(
                    { success: false, error: "File too large (max 20MB)" },
                    { status: 413 }
                )
            }

            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")

            const uploadResponse = await imagekit.upload({
                file: buffer,
                fileName: `${Date.now()}-${safeName}`,
                folder: "/quotations",
                useUniqueFileName: true,
                tags: ["quotation", `entityType:${entityType}`],
            })

            fileUrl = uploadResponse.url
        }

        // 2. Create quotation
        const quotation = await auditedCreate(
            Quotation,
            "QUOTATION",
            {
                entityType,
                entityId,
                title,
                amount,
                gst_percentage,
                url: fileUrl,
                status,
                createdBy: authUser.id
            },
            authUser.id
        )

        // 3. Create interaction
        const interaction = await auditedCreate(
            Interaction,
            "INTERACTION",
            {
                entityType,
                entityId,
                type: INTERACTION_TYPE.QUOTATION_SENT,
                title,
                description,
                status,
                createdBy: authUser.id,
                refId: quotation._id
            },
            authUser.id
        )

        // 4. Prepare update payload
        const updatePayload = {
            lastInteractionAt: new Date(),
            lastInteractionId: interaction._id
        }

        switch (entityType) {
            case ENTITY_TYPE.LEAD:
            case ENTITY_TYPE.CLIENT:
            case ENTITY_TYPE.PROJECT:
                await auditedUpdateByNumericEntityType(
                    entityType,
                    entityId,
                    updatePayload,
                    authUser.id
                )
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
    } catch (error: any) {
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