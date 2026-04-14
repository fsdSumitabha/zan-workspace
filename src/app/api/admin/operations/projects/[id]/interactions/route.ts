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
        const projectId = params.id

        const MEETING_TYPES = [2010, 2020, 2030, 2040]
        const DOCUMENT_TYPES = [2310]
        const QUOTATION_TYPES = [2410]
        const CALL_TYPES = [2210]

        // 1. Fetch interactions for PROJECT
        const interactions = await Interaction.find({
            entityType: 2,
            entityId: projectId
        })
            .sort({ createdAt: -1 })
            .lean()

        // 2. Collect IDs
        const meetingIds: string[] = []
        const documentIds: string[] = []
        const quotationIds: string[] = []
        const callIds: string[] = []

        for (const i of interactions) {
            if (i.refId) {
                const refId = i.refId.toString()

                if (MEETING_TYPES.includes(i.type)) {
                    meetingIds.push(refId)
                } else if (DOCUMENT_TYPES.includes(i.type)) {
                    documentIds.push(refId)
                } else if (QUOTATION_TYPES.includes(i.type)) {
                    quotationIds.push(refId)
                } else if (CALL_TYPES.includes(i.type)) {
                    callIds.push(refId)
                }
            }
        }

        // 3. Fetch related data (parallel)
        const [meetings, documents, quotations, calls] = await Promise.all([
            meetingIds.length
                ? Meeting.find({ _id: { $in: meetingIds } }).lean()
                : [],
            documentIds.length
                ? Document.find({ _id: { $in: documentIds } }).lean()
                : [],
            quotationIds.length
                ? Quotation.find({ _id: { $in: quotationIds } }).lean()
                : [],
            callIds.length
                ? Call.find({ _id: { $in: callIds } }).lean()
                : []
        ])

        // 4. Create maps (O(1) lookup)
        const meetingMap = new Map(meetings.map(m => [m._id.toString(), m]))
        const documentMap = new Map(documents.map(d => [d._id.toString(), d]))
        const quotationMap = new Map(quotations.map(q => [q._id.toString(), q]))
        const callMap = new Map(calls.map(c => [c._id.toString(), c]))

        // 5. Enrich interactions
        const enriched = interactions.map(i => {
            let meeting = null
            let document = null
            let quotation = null
            let call = null

            if (i.refId) {
                const refId = i.refId.toString()

                if (MEETING_TYPES.includes(i.type)) {
                    meeting = meetingMap.get(refId) || null
                } else if (DOCUMENT_TYPES.includes(i.type)) {
                    document = documentMap.get(refId) || null
                } else if (QUOTATION_TYPES.includes(i.type)) {
                    quotation = quotationMap.get(refId) || null
                } else if (CALL_TYPES.includes(i.type)) {
                    call = callMap.get(refId) || null
                }
            }

            return {
                _id: i._id,
                entityType: i.entityType,
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

        return NextResponse.json({
            success: true,
            interactions: enriched
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json(
            { success: false, message: "Failed to fetch project interactions" },
            { status: 500 }
        )
    }
}