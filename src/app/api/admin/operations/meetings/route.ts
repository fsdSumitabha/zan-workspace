import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"
import { ENTITY_TYPE, ENTITY_TYPE_META } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { Meeting as IMeeting } from "@/types/meeting"

export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Math.max(parseInt(searchParams.get("page") || "1"), 1)
        const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10"), 1), 100)
        const skip = (page - 1) * limit

        const query: any = {}

        const entityType = searchParams.get("entityType")
        const entityId = searchParams.get("entityId")
        const status = searchParams.get("status")

        if (entityType !== null) query.entityType = Number(entityType)
        if (entityId) query.entityId = entityId
        if (status !== null) query.status = Number(status)

        const [meetings, total] = await Promise.all([
            Meeting.find(query)
                .sort({ scheduledAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean<IMeeting[]>(),

            Meeting.countDocuments(query)
        ])

        if (page > 1 && meetings.length === 0) {
            return NextResponse.json(
                { success: false, message: "Page out of range" },
                { status: 404 }
            )
        }

        /**
         * STEP 1: Collect IDs by entityType
         */
        const leadIds: any[] = []
        const clientIds: any[] = []
        const projectIds: any[] = []

        for (const m of meetings) {
            if (m.entityType === ENTITY_TYPE.LEAD) leadIds.push(m.entityId)
            if (m.entityType === ENTITY_TYPE.CLIENT) clientIds.push(m.entityId)
            if (m.entityType === ENTITY_TYPE.PROJECT) projectIds.push(m.entityId)
        }

        /**
         * STEP 2: Fetch all entities in parallel
         */
        const [leads, clients, projects] = await Promise.all([
            leadIds.length
                ? Lead.find({ _id: { $in: leadIds } }).select("name title").lean()
                : [],
            clientIds.length
                ? Client.find({ _id: { $in: clientIds } }).select("name company").lean()
                : [],
            projectIds.length
                ? Project.find({ _id: { $in: projectIds } }).select("title name").lean()
                : []
        ])

        /**
         * STEP 3: Create lookup maps
         */
        const leadMap = new Map(leads.map(l => [String(l._id), l.name || l.title]))
        const clientMap = new Map(clients.map(c => [String(c._id), c.company || c.name]))
        const projectMap = new Map(projects.map(p => [String(p._id), p.title || p.name]))

        /**
         * STEP 4: Attach entity meta + title
         */
        const enrichedMeetings = meetings.map((m: IMeeting) => {
            let entityTitle = null

            if (m.entityType === ENTITY_TYPE.LEAD) {
                entityTitle = leadMap.get(String(m.entityId))
            }

            if (m.entityType === ENTITY_TYPE.CLIENT) {
                entityTitle = clientMap.get(String(m.entityId))
            }

            if (m.entityType === ENTITY_TYPE.PROJECT) {
                entityTitle = projectMap.get(String(m.entityId))
            }

            return {
                ...m,
                entity: {
                    type: m.entityType,
                    label: ENTITY_TYPE_META[m.entityType].label,
                    title: entityTitle || "N/A"
                }
            }
        })

        return NextResponse.json(
            {
                success: true,
                data: enrichedMeetings,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page * limit < total,
                    hasPrevPage: page > 1
                }
            },
            { status: 200 }
        )

    } catch (error) {
        console.error("GET MEETINGS ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            meetingLink,
            scheduledAt,
            status
        } = body

        if (entityType === undefined || entityType === null || !entityId) {
            return NextResponse.json(
                { success: false, error: "entityType and entityId are required" },
                { status: 400 }
            )
        }

        // 1. Create Meeting
        const meeting = await Meeting.create({
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            meetingLink,
            scheduledAt,
            status
        })

        // 2. Create Interaction (timeline entry)
        const interaction = await Interaction.create({
            entityType,
            entityId,
            type: INTERACTION_TYPE.MEETING_SCHEDULED,
            title: title,
            description: agenda,
            refId: meeting._id
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
            { success: true, data: meeting },
            { status: 201 }
        )
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { success: false, error: "Failed to create meeting" },
            { status: 500 }
        )
    }
}