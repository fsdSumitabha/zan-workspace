import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import Meeting from "@/models/Meeting"
import Document from "@/models/Document"
import Quotation from "@/models/Quotation"
import Call from "@/models/Call"

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        const params = await context.params
        const clientId = params.id

        const MEETING_TYPES = [2010, 2020, 2030, 2040]
        const DOCUMENT_TYPES = [2310]
        const QUOTATION_TYPES = [2410]
        const CALL_TYPES = [2210]

        // 1. Fetch interactions
        const interactions = await Interaction.find({
            entityType: 1,
            entityId: clientId
        })
            .sort({ createdAt: -1 })
            .lean()

        // 2. Collect IDs
        const meetingIds: string[] = []
        const documentIds: string[] = []
        const quotationIds: string[] = []
        const callIds: string[] = []

        for (const i of interactions) {
            if (MEETING_TYPES.includes(i.type) && i.refId) {
                meetingIds.push(i.refId.toString())
            }

            if (DOCUMENT_TYPES.includes(i.type) && i.refId) {
                documentIds.push(i.refId.toString())
            }

            if (QUOTATION_TYPES.includes(i.type) && i.refId) {
                quotationIds.push(i.refId.toString())
            }
            if (CALL_TYPES.includes(i.type) && i.refId) {
                callIds.push(i.refId.toString())
            }
        }

        // 3. Fetch related data
        const [meetings, documents, quotations, calls] = await Promise.all([
            Meeting.find({ _id: { $in: meetingIds } }).lean(),
            Document.find({ _id: { $in: documentIds } }).lean(),
            Quotation.find({ _id: { $in: quotationIds } }).lean(),
            Call.find({ _id: { $in: callIds } }).lean()
        ])

        const meetingMap = new Map(meetings.map(m => [m._id.toString(), m]))
        const documentMap = new Map(documents.map(d => [d._id.toString(), d]))
        const quotationMap = new Map(quotations.map(q => [q._id.toString(), q]))
        const callMap = new Map(calls.map(c => [c._id.toString(), c]))

        // 4. Structure response
        const enriched = interactions.map(i => {
            let meeting = null
            let document = null
            let quotation = null
            let call = null

            if (MEETING_TYPES.includes(i.type) && i.refId) {
                meeting = meetingMap.get(i.refId.toString()) || null
            }

            if (DOCUMENT_TYPES.includes(i.type) && i.refId) {
                document = documentMap.get(i.refId.toString()) || null
            }

            if (QUOTATION_TYPES.includes(i.type) && i.refId) {
                quotation = quotationMap.get(i.refId.toString()) || null
            }
            if (CALL_TYPES.includes(i.type) && i.refId) {
                call = callMap.get(i.refId.toString()) || null
            }

            return {
                _id: i._id,
                type: i.type,
                title: i.title,
                description: i.description,
                createdAt: i.createdAt,

                meeting,
                document,
                quotation,
                call
            }
        })

        return NextResponse.json({ success: true, interactions: enriched })

    } catch (error) {
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to fetch interactions" },
            { status: 500 }
        )
    }
}