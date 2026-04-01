import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Quotation from "@/models/Quotation"
import Interaction from "@/models/Interaction"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const formData = await req.formData()

        const entityType = Number(formData.get("entityType"))
        const entityId = formData.get("entityId") as string
        const title = formData.get("title") as string
        const description = formData.get("description") as string
        const amount = Number(formData.get("amount"))
        const gst_percentage = Number(formData.get("gst_percentage"))
        const status = Number(formData.get("status"))

        const file = formData.get("file") as File | null

        let fileUrl = ""

        // 1. Handle file upload
        if (file) {
            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            const uploadDir = path.join(process.cwd(), "public/uploads/quotations")

            // ensure folder exists
            await mkdir(uploadDir, { recursive: true })

            const fileName = `${Date.now()}-${file.name}`
            const filePath = path.join(uploadDir, fileName)

            await writeFile(filePath, buffer)

            fileUrl = `/uploads/${fileName}`
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
        await Interaction.create({
            entityType,
            entityId,
            type: 2410,
            title,
            description,
            status,
            refId: quotation._id
        })

        return NextResponse.json(
            { success: true, data: quotation },
            { status: 201 }
        )
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create quotation" },
            { status: 500 }
        )
    }
}