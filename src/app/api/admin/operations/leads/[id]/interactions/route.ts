import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import Meeting from "@/models/Meeting"
import Document from "@/models/Document"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        const params = await context.params
        const leadId = params.id

        const MEETING_TYPES = [2010, 2020, 2030, 2040]
        const DOCUMENT_TYPES = [2310]

        // 1. Fetch interactions
        const interactions = await Interaction.find({
            entityType: 0,
            entityId: leadId
        })
            .sort({ createdAt: -1 })
            .lean()

        // 2. Collect IDs
        const meetingIds: string[] = []
        const documentIds: string[] = []

        for (const i of interactions) {
            if (MEETING_TYPES.includes(i.type) && i.refId) {
                meetingIds.push(i.refId.toString())
            }

            if (DOCUMENT_TYPES.includes(i.type) && i.refId) {
                documentIds.push(i.refId.toString())
            }
        }

        // 3. Fetch related data
        const [meetings, documents] = await Promise.all([
            Meeting.find({ _id: { $in: meetingIds } }).lean(),
            Document.find({ _id: { $in: documentIds } }).lean()
        ])

        const meetingMap = new Map(
            meetings.map(m => [m._id.toString(), m])
        )

        const documentMap = new Map(
            documents.map(d => [d._id.toString(), d])
        )

        // 4. Structure response (THIS IS THE KEY CHANGE)
        const enriched = interactions.map(i => {
            let meeting = null
            let document = null

            if (MEETING_TYPES.includes(i.type) && i.refId) {
                meeting = meetingMap.get(i.refId.toString()) || null
            }

            if (DOCUMENT_TYPES.includes(i.type) && i.refId) {
                document = documentMap.get(i.refId.toString()) || null
            }

            return {
                _id: i._id,
                type: i.type,
                title: i.title,
                description: i.description,
                createdAt: i.createdAt,

                // 🔥 structured nesting
                meeting,
                document
            }
        })

        return NextResponse.json({
            success: true,
            interactions: enriched
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to fetch interactions" },
            { status: 500 }
        )
    }
}