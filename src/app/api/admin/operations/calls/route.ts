import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import Call from "@/models/Call"

import path from "path"
import { writeFile, mkdir } from "fs/promises"

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const formData = await req.formData()

        const entityType = Number(formData.get("entityType"))
        const entityId = formData.get("entityId") as string

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
            type: 2210, // CALL
            title: title || `Call with ${contactPersonName}`,
            notes,
            refId: call._id
        })

        return NextResponse.json(
            { success: true, data: { call, interaction } },
            { status: 201 }
        )

    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create call" },
            { status: 500 }
        )
    }
}