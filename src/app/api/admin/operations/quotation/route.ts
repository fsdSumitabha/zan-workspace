import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Quotation from "@/models/Quotation"
import Interaction from "@/models/Interaction"

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const formData = await req.formData()

        const entityType = Number(formData.get("entityType"))
        const entityId = formData.get("entityId") as string
        const title = formData.get("title") as string
        const description = formData.get("description") as string
        const amount = Number(formData.get("amount"))
        const status = Number(formData.get("status"))

        const file = formData.get("file") as File | null

        let fileUrl = ""

        // 1. Handle file upload
        if (file) {
            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            const fileName = `${Date.now()}-${file.name}`

            // Example: save locally (for now)
            const path = require("path")
            const fs = require("fs")

            const uploadDir = path.join(process.cwd(), "public/uploads/quotations/")

            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true })
            }

            const filePath = path.join(uploadDir, fileName)

            fs.writeFileSync(filePath, buffer)

            fileUrl = `/uploads/${fileName}`
        }

        // 2. Create Quotation
        const quotation = await Quotation.create({
            entityType,
            entityId,
            title,
            amount,
            url: fileUrl,
            status
        })

        // 3. Create Interaction (timeline)
        await Interaction.create({
            entityType,
            entityId,
            type: 2410, // QUOTATION_SENT
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