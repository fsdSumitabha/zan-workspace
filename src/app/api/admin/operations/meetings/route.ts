import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"
import User from "@/models/User"
import { ENTITY_TYPE, ENTITY_TYPE_META } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { MEETING_STATUS } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import { MEETING_MANAGE_ROLES } from "@/constants/meetingRoles"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { Meeting as IMeeting } from "@/types/meeting"
import { AuthError, requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedCreate, auditedUpdateByNumericEntityType } from "@/lib/activity-log"
import { escapeRegex } from "@/lib/search/escapeRegex"
import {
    cancelMeetEvent,
    createMeetEvent,
    isGoogleAuthError,
    isGoogleCalendarConfigured,
} from "@/lib/google/calendar/calendar"
import { resolveAttendeeEmails } from "@/lib/google/calendar/attendees"
import { resolveEntityEmail } from "@/lib/google/calendar/resolveEntityEmail"
import { parseMeetingStart } from "@/lib/time/meetingTime"
import { resolveViewerZone } from "@/lib/time/viewerZone"
import { addDaysToKey, dateKeyInZone, dayRangeInZone, normalizeTimeZone, zoneForRegion } from "@/lib/time/zone"

import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { resolveParentName } from "@/lib/notifications/resolveParentName"

export async function GET(req: NextRequest) {
    try {
        // The await matters. Without it requireAuth returns a pending promise,
        // the handler runs on, and two things break: a 401 becomes an
        // unhandled rejection instead of a response, and the region context is
        // still empty when the query runs, so the list comes back empty.
        const authUser = await requireAuth(req)

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

        // Temporal quick-range on scheduledAt. "Today" is the viewer's
        // calendar day, not the server's: Vercel runs in UTC, so a UTC "today"
        // starts at 5:30 AM in India and at 4:00 AM in Dubai.
        if (range) {
            const now = new Date()
            const zone = resolveViewerZone(req, authUser)
            const todayKey = dateKeyInZone(now, zone)
            const today = dayRangeInZone(todayKey, zone)

            if (range === "today" && today) {
                query.scheduledAt = { $gte: today.start, $lt: today.end }
            } else if (range === "last7" && today) {
                // Last 7 days, today inclusive.
                const first = dayRangeInZone(addDaysToKey(todayKey, -6), zone)
                query.scheduledAt = { $gte: first?.start ?? today.start, $lt: today.end }
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

// A meeting may start up to this long ago. It covers a slow form and a
// device clock that runs a little behind, not a meeting in the past.
const PAST_GRACE_MS = 5 * 60_000

function fail(message: string, status: number, field?: string) {
    return NextResponse.json({ success: false, message, field }, { status })
}

/** The record the meeting is for. Null when it does not exist in the caller's regions. */
async function findParent(entityType: number, entityId: string): Promise<{ region?: string } | null> {
    const select = "region"
    switch (entityType) {
        case ENTITY_TYPE.LEAD:
            return Lead.findById(entityId).select(select).lean<{ region?: string }>()
        case ENTITY_TYPE.CLIENT:
            return Client.findById(entityId).select(select).lean<{ region?: string }>()
        case ENTITY_TYPE.PROJECT:
            return Project.findById(entityId).select(select).lean<{ region?: string }>()
        default:
            return null
    }
}

export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, MEETING_MANAGE_ROLES)

        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            description,
            attendees,
        } = body
        const title = typeof body.title === "string" ? body.title.trim() : ""
        const agenda = typeof body.agenda === "string" ? body.agenda.trim() : ""
        const meetingType = Number(body.meetingType ?? MEETING_TYPE.ONLINE)

        // Everything is checked before Google is called. Google emails the
        // invite the moment the event exists, so a meeting that then fails
        // to save would leave the client holding an invite to nothing.
        if (entityType === undefined || entityType === null || !entityId) {
            return fail("entityType and entityId are required", 400)
        }
        if (
            entityType !== ENTITY_TYPE.LEAD &&
            entityType !== ENTITY_TYPE.CLIENT &&
            entityType !== ENTITY_TYPE.PROJECT
        ) {
            return fail("Invalid entityType", 400)
        }
        if (!mongoose.Types.ObjectId.isValid(entityId)) {
            return fail("Invalid entityId", 400)
        }
        if (!title) return fail("Give the meeting a title.", 400, "title")
        if (!agenda) return fail("Write the agenda of the meeting.", 400, "agenda")
        if (meetingType !== MEETING_TYPE.ONLINE && meetingType !== MEETING_TYPE.OFFLINE) {
            return fail("Invalid meeting type", 400, "meetingType")
        }

        const parent = await findParent(entityType, entityId)
        if (!parent) {
            return fail(`${ENTITY_TYPE_META[entityType as 0 | 1 | 2].label} not found`, 404)
        }

        // The client's time zone. The web form sends it. The phone app does not
        // yet, so the client's region decides for it.
        const timeZone = normalizeTimeZone(body.timeZone) ?? zoneForRegion(parent.region)

        // The form sends an exact moment ("...Z"). A time without a zone is
        // read in the client's zone, never in the server's (UTC).
        const start = parseMeetingStart(body.scheduledAt, timeZone)
        if (!start) {
            return fail("Pick a date and time for the meeting.", 400, "scheduledAt")
        }
        if (start.getTime() < Date.now() - PAST_GRACE_MS) {
            return fail("That time has already passed. Pick a time in the future.", 400, "scheduledAt")
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

        if (meetingType === MEETING_TYPE.ONLINE) {
            // An online meeting needs a Meet link, and only Google makes one.
            if (!isGoogleCalendarConfigured()) {
                return fail(
                    "Online meetings need Google Calendar, and it is not connected. Choose Offline, or ask an admin.",
                    503
                )
            }

            try {
                const attendeeEmails = await resolveAttendeeEmails(attendeeIds)

                const entityEmail = await resolveEntityEmail(entityType, entityId)
                if (entityEmail) {
                    attendeeEmails.push(entityEmail)
                }

                const event = await createMeetEvent({
                    summary: title,
                    description,
                    startISO: start.toISOString(),
                    timeZone,
                    attendeeEmails: [...new Set(attendeeEmails)],
                    requestId: meetingId.toString(),
                    sendUpdates: "all",
                })

                googleEventId = event.googleEventId || null
                meetingLink = event.meetingLink ?? event.htmlLink
            } catch (err) {
                console.error("Google Calendar event creation failed:", err)
                return fail(
                    isGoogleAuthError(err)
                        ? "Google Calendar access has expired. An admin must reconnect it."
                        : "Google Calendar did not create the meeting. Try again in a minute.",
                    502
                )
            }
        }

        // 1. Create Meeting
        let meeting
        try {
            meeting = await auditedCreate(
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
                    scheduledAt: start,
                    timeZone,
                    // A new meeting is always scheduled.
                    status: MEETING_STATUS.SCHEDULED,
                    attendees: attendeeIds,
                    // The id was saved as `googleEventId` before, a field the
                    // model does not have, so Mongoose dropped it. That is why
                    // cancel and reschedule never reached Google.
                    external: googleEventId
                        ? {
                              provider: "GOOGLE",
                              eventId: googleEventId,
                              syncedAt: new Date(),
                              syncedStatus: MEETING_STATUS.SCHEDULED,
                          }
                        : undefined,
                    createdBy: authUser.id,
                },
                authUser.id
            )
        } catch (err) {
            // Take the invite back, so the client does not keep an invite
            // the CRM has no record of.
            if (googleEventId) {
                await cancelMeetEvent(googleEventId, "all").catch((cancelErr) =>
                    console.error("Failed to roll back Google event:", cancelErr)
                )
            }
            throw err
        }

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

        // 3. Point the parent at its latest interaction
        await auditedUpdateByNumericEntityType(
            entityType,
            entityId,
            {
                lastInteractionAt: new Date(),
                lastInteractionId: interaction._id,
            },
            authUser.id
        )

        // 4. Emit notification
        const parentName = await resolveParentName(
            meeting.entityType,
            String(meeting.entityId)
        )
        await emitNotification({
            type: EVENT_CODE.MEETING_SCHEDULED,
            entityType: ENTITY_TYPE.MEETING,
            entityId: meeting._id,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: {
                meeting: {
                    _id: meeting._id,
                    title: meeting.title,
                    entityType: meeting.entityType,
                    entityId: meeting.entityId,
                    scheduledAt: meeting.scheduledAt,
                    timeZone: meeting.timeZone,
                    region: meeting.region,
                },
                parentName,
            },
            extraRecipients: Array.isArray(meeting.attendees)
                ? meeting.attendees.map((a: any) => String(a))
                : undefined,
        })

        return NextResponse.json(
            { success: true, data: meeting },
            { status: 201 }
        )
    } catch (error: any) {
        console.error(error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, error: error.message, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, error: "Failed to create meeting", message: "Failed to create meeting" },
            { status: 500 }
        )
    }
}
