import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"
import User from "@/models/User"
import { ENTITY_TYPE, ENTITY_TYPE_META } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { Meeting as IMeeting } from "@/types/meeting"
import { AuthError, requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedCreate, auditedUpdateByNumericEntityType } from "@/lib/activity-log"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { createMeetEvent, isGoogleCalendarConfigured } from "@/lib/google/calendar/calendar"
import { resolveAttendeeEmails } from "@/lib/google/calendar/attendees"
import { resolveEntityEmail } from "@/lib/google/calendar/resolveEntityEmail"


export async function GET(req: NextRequest) {
    try {
        requireAuth(req)

        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Math.max(parseInt(searchParams.get("page") || "1"), 1)
        const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10"), 1), 100)
        const skip = (page - 1) * limit

        const query: any = {}

        const entityType = searchParams.get("entityType")
        const entityId = searchParams.get("entityId")
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const range = searchParams.get("range")

        if (entityType) query.entityType = Number(entityType)
        if (entityId) query.entityId = entityId
        if (status) query.status = Number(status)

        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            query.$or = [
                { title: re },
                { agenda: re },
                { description: re },
            ]
        }

        // Temporal quick-range on scheduledAt.
        if (range) {
            const now = new Date()

            if (range === "today") {
                const start = new Date(now)
                start.setHours(0, 0, 0, 0)
                const end = new Date(now)
                end.setHours(23, 59, 59, 999)
                query.scheduledAt = { $gte: start, $lte: end }
            } else if (range === "last7") {
                // Last 7 days, today inclusive.
                const start = new Date(now)
                start.setDate(start.getDate() - 6)
                start.setHours(0, 0, 0, 0)
                const end = new Date(now)
                end.setHours(23, 59, 59, 999)
                query.scheduledAt = { $gte: start, $lte: end }
            } else if (range === "upcoming") {
                query.scheduledAt = { $gte: now }
            }
        }

        const [meetings, total] = await Promise.all([
            Meeting.find(query)
                .sort({ scheduledAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "attendees",
                    select: "_id name email role avatar",
                    model: User,
                })
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

    } catch (error: any) {
        console.error("GET MEETINGS ERROR:", error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}

export const runtime = "nodejs"
const GOOGLE_MEET_TYPE = 0

export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 60, 45, 70])
 
        await dbConnect()
 
        const body = await req.json()
 
        const {
            entityType,
            entityId,
            title,
            agenda,
            description,
            meetingType,
            scheduledAt,
            status,
            attendees,
        } = body
 
        if (entityType === undefined || entityType === null || !entityId) {
            return NextResponse.json(
                { success: false, error: "entityType and entityId are required" },
                { status: 400 }
            )
        }
 
        // Normalize attendees: keep only valid ObjectId strings, dedupe.
        const attendeeIds: string[] = Array.isArray(attendees)
            ? [
                  ...new Set(
                      attendees.filter(
                          (a: unknown): a is string =>
                              typeof a === "string" &&
                              mongoose.Types.ObjectId.isValid(a)
                      )
                  ),
              ]
            : []
 
        const meetingId = new mongoose.Types.ObjectId()
 
        let meetingLink: string | null = null
        let googleEventId: string | null = null
        let conferenceStatus: string | null = null
        let googleError: string | null = null
 
        if (
            meetingType === GOOGLE_MEET_TYPE &&
            scheduledAt &&
            isGoogleCalendarConfigured()
        ) {
            try {
                const attendeeEmails = await resolveAttendeeEmails(attendeeIds)

                const entityEmail = await resolveEntityEmail(entityType, entityId)
                console.log("Resolved entity email:", entityEmail)
                
                if (entityEmail) {
                    attendeeEmails.push(entityEmail)
                }

                const event = await createMeetEvent({
                    summary: title,
                    description,
                    startISO: new Date(scheduledAt).toISOString(),
                    attendeeEmails: [...new Set(attendeeEmails)],
                    requestId: meetingId.toString(),
                    sendUpdates: "all",
                })
 
                meetingLink = event.meetingLink
                googleEventId = event.googleEventId
                conferenceStatus = event.conferenceStatus
            } catch (err) {
                console.error("Google Calendar event creation failed:", err)
                googleError =
                    err instanceof Error
                        ? err.message
                        : "Unknown error while creating the Google Meet event."
            }
        }

        // 1. Create Meeting
        const meeting = await auditedCreate(
            Meeting,
            ENTITY_TYPE.MEETING,
            {
                _id: meetingId,
                entityType,
                entityId,
                title,
                agenda,
                description,
                meetingType,
                meetingLink,
                scheduledAt,
                status,
                attendees: attendeeIds,
                googleEventId,
                conferenceStatus,
                createdBy: authUser.id,
            },
            authUser.id
        )
 
        // 2. Create Interaction (timeline entry)
        const interaction = await auditedCreate(
            Interaction,
            ENTITY_TYPE.INTERACTION,
            {
                entityType,
                entityId,
                type: INTERACTION_TYPE.MEETING_SCHEDULED,
                title: title,
                description: agenda,
                createdBy: authUser.id,
                refId: meeting._id,
            },
            authUser.id
        )
 
        // 2. Prepare update payload
        const updatePayload = {
            lastInteractionAt: new Date(),
            lastInteractionId: interaction._id,
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
            { success: true, data: meeting, googleError },
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
            { success: false, error: "Failed to create meeting" },
            { status: 500 }
        )
    }
}