import { NextRequest, NextResponse } from "next/server"
import { enterRegionContext, getRegionContext, runWithoutRegionScope } from "@/lib/region-scope"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Meeting from "@/models/Meeting"
import Interaction from "@/models/Interaction"
import User from "@/models/User"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { MEETING_STATUS } from "@/constants/meetingStatus"
import { MEETING_TYPE } from "@/constants/meetingTypes"
import { EVENT_CODE } from "@/constants/eventTypes"
import { auditedCreate, auditedUpdateByNumericEntityType } from "@/lib/activity-log"
import { emitNotification } from "@/lib/notifications/emit"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { checkRateLimit } from "@/lib/security/rateLimit"
import { getClientIp } from "@/lib/security/clientIp"
import { phoneLookupCondition, validatePhone } from "@/lib/phone"
import { getRegion, type RegionCode } from "@/lib/region"
import {
    cancelMeetEvent,
    createMeetEvent,
    isGoogleAuthError,
    isGoogleCalendarConfigured,
} from "@/lib/google/calendar/calendar"
import {
    BOOKING_RULES,
    getBookingTimeZone,
    invalidateBusyCache,
    isBookableSlotStart,
    isSlotFree,
} from "@/lib/booking/availability"

export const runtime = "nodejs"

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

const NAME_MAX = 120
const EMAIL_MAX = 200
const COMPANY_MAX = 120
const NOTES_MAX = 1000

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DEFAULT_HOST_EMAIL = "sales@zanservices.com"

const UNAVAILABLE_MESSAGE =
    "We couldn't confirm your booking right now. Please try again shortly."

/**
 * Slot starts currently being booked in this process. Stops two simultaneous
 * requests for the same slot from both passing the free/busy re-check.
 * In-memory, like the rate limiter: correct for a single instance only.
 */
const slotsInFlight = new Set<string>()

function fail(message: string, status: number, field?: string) {
    return NextResponse.json({ success: false, message, field }, { status })
}

function readString(raw: Record<string, unknown>, key: string): string {
    const value = raw[key]
    return typeof value === "string" ? value.trim() : ""
}

async function resolveLeadId(
    input: { name: string; email: string; phone: string },
    actorId: string
): Promise<string> {
    const byPhone = await Lead.findOne({
        phone: phoneLookupCondition(input.phone, getRegion().phoneCountry),
    })
        .select("_id")
        .lean<{ _id: unknown }>()
    if (byPhone) return String(byPhone._id)

    const byEmail = await Lead.findOne({
        email: { $regex: `^${escapeRegex(input.email)}$`, $options: "i" },
    })
        .select("_id")
        .lean<{ _id: unknown }>()
    if (byEmail) return String(byEmail._id)

    try {
        const lead = await auditedCreate(
            Lead,
            ENTITY_TYPE.LEAD,
            {
                name: input.name,
                email: input.email,
                phone: input.phone,
                source: "booking-page",
                createdBy: actorId,
            },
            actorId
        )
        return String(lead._id)
    } catch (err) {
        // Duplicate phone: either a concurrent request won the race, or the
        // phone belongs to a soft-deleted lead (hidden from normal finds).
        if ((err as { code?: number })?.code === 11000) {
            // Deliberately NOT region-filtered. The unique index on phone
            // is global, so this has to look everywhere the index does.
            // Adding a region filter here would find nothing and rethrow
            // the driver error as a 500.
            //
            // The rare bad case: a booking in one region reuses a lead
            // that belongs to another. That is the same cross-region phone
            // collision described in docs/region-rollout.md section 1.4.
            const existing = await Lead.collection.findOne(
                { phone: input.phone },
                { projection: { _id: 1, region: 1 } }
            )
            if (existing) {
                // The meeting and interaction booked next belong to this
                // lead's region. regionScopePlugin refuses a child whose
                // parent is outside the request's regions, so add it here.
                // The rest of this request only writes those two records.
                const ctx = getRegionContext()
                const leadRegion = existing.region as RegionCode | undefined
                if (ctx && leadRegion && !ctx.regions.includes(leadRegion)) {
                    ctx.regions = [...ctx.regions, leadRegion]
                }
                return String(existing._id)
            }
        }
        throw err
    }
}

/**
 * Public: books a slot. The client and the sales inbox are invited to a
 * Google Meet event on the office calendar, and the booking is recorded in
 * the CRM as a Lead meeting.
 */
export async function POST(req: NextRequest) {
    // Nobody is signed in here, so there is no region scope yet. Give the
    // request the deploy region instead of a bypass. Reads stay filtered
    // and regionScopePlugin stamps the new lead, so this path needs no
    // special handling anywhere downstream.
    //
    // Facebook Lead Ads is the one that will need a better rule later:
    // one deploy can receive forms from several regions. Map form_id to a
    // region when that happens. See docs/region-rollout.md.
    const deployRegion = getRegion().code
    enterRegionContext({ regions: [deployRegion], writeRegion: deployRegion })

    const rl = checkRateLimit(
        `public-booking:${getClientIp(req)}`,
        RATE_LIMIT,
        RATE_WINDOW_MS
    )
    if (!rl.allowed) {
        const res = fail("Too many booking attempts. Please try again later.", 429)
        res.headers.set("Retry-After", String(rl.retryAfterSec))
        return res
    }

    let raw: Record<string, unknown>
    try {
        const parsed = await req.json()
        if (!parsed || typeof parsed !== "object") return fail("Invalid request", 400)
        raw = parsed as Record<string, unknown>
    } catch {
        return fail("Invalid request", 400)
    }

    // Honeypot: real users never see or fill this field. Pretend success.
    if (readString(raw, "company_website")) {
        return NextResponse.json({ success: true }, { status: 201 })
    }

    const name = readString(raw, "name")
    const email = readString(raw, "email").toLowerCase()
    const company = readString(raw, "company")
    const notes = readString(raw, "notes")
    const startISO = readString(raw, "start")

    if (!name || name.length > NAME_MAX) {
        return fail("Please enter your name.", 400, "name")
    }
    if (!email || email.length > EMAIL_MAX || !EMAIL_REGEX.test(email)) {
        return fail("Please enter a valid email address.", 400, "email")
    }
    const phoneCheck = validatePhone(readString(raw, "phone"), getRegion().phoneCountry)
    if (!phoneCheck.ok) {
        return fail(phoneCheck.message, 400, "phone")
    }
    const phone = phoneCheck.e164
    if (company.length > COMPANY_MAX) {
        return fail("Company name is too long.", 400, "company")
    }
    if (notes.length > NOTES_MAX) {
        return fail("Notes are too long.", 400, "notes")
    }

    const start = new Date(startISO)
    if (!startISO || !isBookableSlotStart(start)) {
        return fail("That time is no longer available. Please pick another slot.", 409, "start")
    }

    if (!isGoogleCalendarConfigured()) {
        console.error("[booking] Google Calendar env vars are not configured")
        return fail(UNAVAILABLE_MESSAGE, 503)
    }

    const actorId = process.env.ZANSERVICES_USER_ID
    if (!actorId) {
        console.error("[booking] ZANSERVICES_USER_ID env var missing")
        return fail(UNAVAILABLE_MESSAGE, 500)
    }

    const slotKey = start.toISOString()
    if (slotsInFlight.has(slotKey)) {
        return fail("That time is no longer available. Please pick another slot.", 409, "start")
    }
    slotsInFlight.add(slotKey)

    let googleEventId: string | null = null

    try {
        // Re-check live so a slot taken since the page loaded can't be double-booked.
        if (!(await isSlotFree(start))) {
            invalidateBusyCache()
            return fail("That time is no longer available. Please pick another slot.", 409, "start")
        }

        await dbConnect()

        const leadId = await resolveLeadId({ name, email, phone }, actorId)

        const hostEmail = (process.env.BOOKING_HOST_EMAIL || DEFAULT_HOST_EMAIL).toLowerCase()
        // The host comes from config, not from the booking. It is looked
        // up outside the region scope so a host account that does not hold
        // the deploy region still resolves.
        const hostUser = await runWithoutRegionScope(() =>
            User.findOne({ email: hostEmail }).select("_id").lean<{ _id: unknown }>()
        )
        const attendeeIds = hostUser ? [String(hostUser._id)] : []

        const title = `Meeting with ${name}${company ? ` (${company})` : ""}`
        const agenda = notes || "Meeting booked via the public booking page."
        const description = [
            "Booked via the public booking page.",
            "",
            `Name: ${name}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            company ? `Company: ${company}` : null,
            notes ? `\nNotes:\n${notes}` : null,
        ]
            .filter((line) => line !== null)
            .join("\n")

        const meetingId = new mongoose.Types.ObjectId()

        const event = await createMeetEvent({
            summary: title,
            description,
            startISO: slotKey,
            durationMinutes: BOOKING_RULES.slotMinutes,
            attendeeEmails: [...new Set([email, hostEmail])],
            requestId: meetingId.toString(),
            sendUpdates: "all",
        })
        googleEventId = event.googleEventId || null

        const meetingLink = event.meetingLink ?? event.htmlLink
        if (!meetingLink) {
            throw new Error("[booking] Google returned neither a Meet link nor an event link")
        }

        const meeting = await auditedCreate(
            Meeting,
            ENTITY_TYPE.MEETING,
            {
                _id: meetingId,
                entityType: ENTITY_TYPE.LEAD,
                entityId: leadId,
                title,
                agenda,
                description,
                meetingType: MEETING_TYPE.ONLINE,
                meetingLink,
                scheduledAt: start,
                status: MEETING_STATUS.SCHEDULED,
                attendees: attendeeIds,
                external: googleEventId
                    ? { provider: "GOOGLE", eventId: googleEventId }
                    : undefined,
                createdBy: actorId,
            },
            actorId
        )

        // The booking is now real (calendar + CRM). Everything below is
        // secondary bookkeeping and must not fail the request.
        googleEventId = null
        invalidateBusyCache()

        try {
            const interaction = await auditedCreate(
                Interaction,
                ENTITY_TYPE.INTERACTION,
                {
                    entityType: ENTITY_TYPE.LEAD,
                    entityId: leadId,
                    type: INTERACTION_TYPE.MEETING_SCHEDULED,
                    title,
                    description: agenda,
                    createdBy: actorId,
                    refId: meeting._id,
                },
                actorId
            )

            await auditedUpdateByNumericEntityType(
                ENTITY_TYPE.LEAD,
                leadId,
                { lastInteractionAt: new Date(), lastInteractionId: interaction._id },
                actorId
            )

            await emitNotification({
                type: EVENT_CODE.MEETING_SCHEDULED,
                entityType: ENTITY_TYPE.MEETING,
                entityId: meeting._id,
                actor: { id: actorId, name: "Booking page" },
                payload: {
                    meeting: {
                        _id: meeting._id,
                        title: meeting.title,
                        entityType: meeting.entityType,
                        entityId: meeting.entityId,
                        scheduledAt: meeting.scheduledAt,
                    },
                    parentName: name,
                },
                extraRecipients: attendeeIds.length ? attendeeIds : undefined,
            })
        } catch (err) {
            console.error("[booking] Post-booking bookkeeping failed:", err)
        }

        return NextResponse.json(
            {
                success: true,
                data: {
                    start: slotKey,
                    end: new Date(start.getTime() + BOOKING_RULES.slotMinutes * 60_000).toISOString(),
                    timeZone: getBookingTimeZone(),
                    meetingLink: event.meetingLink,
                    email,
                },
            },
            { status: 201 }
        )
    } catch (err) {
        if (isGoogleAuthError(err)) {
            console.error(
                "[booking] Google rejected the refresh token (invalid_grant). Re-authorize and update GOOGLE_CALENDAR_REFRESH_TOKEN."
            )
        } else {
            console.error("[booking] Booking failed:", err)
        }

        // Roll back the calendar event if the CRM record couldn't be saved,
        // so the client isn't left holding an invite we have no record of.
        if (googleEventId) {
            await cancelMeetEvent(googleEventId, "all").catch((cancelErr) =>
                console.error("[booking] Failed to roll back Google event:", cancelErr)
            )
        }

        return fail(UNAVAILABLE_MESSAGE, 503)
    } finally {
        slotsInFlight.delete(slotKey)
    }
}
