import mongoose, { Schema, Document } from "mongoose"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { MEETING_STATUS, MeetingStatus } from "@/constants/meetingStatus"
import { MeetingType } from "@/constants/meetingTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin, inheritFromEntity } from "@/lib/region-scope"

interface IRescheduleEntry {
    oldDate?: Date
    newDate?: Date
    reason?: string
    changedBy?: mongoose.Types.ObjectId
    changedAt?: Date
}

export interface IMeeting extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    entityType: number
    entityId: mongoose.Types.ObjectId
    title: string
    agenda: string
    description?: string
    meetingType?: MeetingType
    meetingLink?: string
    attendees?: mongoose.Types.ObjectId[]
    scheduledAt: Date
    timeZone?: string
    status: MeetingStatus
    outcome?: string
    rescheduleHistory?: IRescheduleEntry[]
    external?: {
        provider?: string
        eventId?: string
        syncedAt?: Date
        syncedStatus?: number
        syncError?: string
    }
    createdBy?: mongoose.Types.ObjectId
}

const MeetingSchema = new mongoose.Schema<IMeeting>({
    // Not required yet. Existing rows are backfilled by
    // `npm run db:backfill-region`. Stamped on create by regionScopePlugin.
    region: {
        type: String,
        enum: REGION_CODES,
        index: true
    },

    entityType: {
        type: Number,
        enum: [0, 1, 2], // 0: LEAD, 1: CLIENT, 2: PROJECT
        required: true
    },

    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    title: {
        type: String,
        required: true
    },

    agenda: {
        type: String, // pre-meeting intent
        required: true
    },

    description: String,

    meetingType: {
        type: Number,
        enum: [0, 1], // 0: ONLINE, 1: OFFLINE
        default: 0
    },

    meetingLink: {
        type: String,
        validate: {
            validator: function (this: IMeeting, value: string) {
                if (this.meetingType === 0) return !!value
                return true
            },
            message: "Meeting link required for online meetings"
        }
    },

    attendees: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }
    ],

    // The one exact moment of the meeting, saved in UTC.
    scheduledAt: {
        type: Date,
        required: true
    },

    // The client's time zone, an IANA name such as "Asia/Dubai". It does not
    // change the moment above. It says how to show that moment to the client,
    // and it is the zone of the Google invite. The form takes it from the
    // client's region unless someone changes it. Meetings made before
    // 19 Nov 2026 have none, and meetingZone() then uses their region's zone.
    // See docs/time-zones.md.
    timeZone: String,

    status: {
        type: Number,
        required: true
    },

    outcome: {
        type: String,
        required: function () {
            return this.status === MEETING_STATUS.COMPLETED
        }
    },

    rescheduleHistory: [
        {
            oldDate: Date,
            newDate: Date,
            reason: String,
            changedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            changedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    // The Google Calendar event. See src/lib/google/calendar/syncMeeting.ts.
    external: {
        provider: String, // "GOOGLE"
        eventId: String,
        // When Google last matched this meeting, and the status it matched.
        // A cancelled meeting whose syncedStatus is not CANCELLED may still
        // sit in the guests' calendars.
        syncedAt: Date,
        syncedStatus: Number,
        // Why the last change did not reach Google. Cleared when one does.
        syncError: String
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

statsInvalidatePlugin(MeetingSchema)

regionScopePlugin(MeetingSchema, { inheritFrom: inheritFromEntity })

const Meeting =
    mongoose.models.Meeting ||
    mongoose.model<IMeeting>("Meeting", MeetingSchema)

statsInvalidatePlugin(Meeting.schema)

regionScopePlugin(Meeting.schema, { inheritFrom: inheritFromEntity })

export default Meeting