import mongoose, { Schema, Document } from "mongoose"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"

interface IRescheduleEntry {
    oldDate?: Date
    newDate?: Date
    reason?: string
    changedBy?: mongoose.Types.ObjectId
    changedAt?: Date
}

export interface IMeeting extends Document {
    entityType: number
    entityId: mongoose.Types.ObjectId
    title: string
    agenda: string
    description?: string
    meetingType?: number
    meetingLink?: string
    attendees?: mongoose.Types.ObjectId[]
    scheduledAt: Date
    status: number
    outcome?: string
    rescheduleHistory?: IRescheduleEntry[]
    external?: {
        provider?: string
        eventId?: string
    }
    createdBy?: mongoose.Types.ObjectId
}

const MeetingSchema = new mongoose.Schema<IMeeting>({

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

    scheduledAt: {
        type: Date,
        required: true
    },

    status: {
        type: Number,
        required: true
    },

    outcome: {
        type: String,
        required: function () {
            return this.status === 1050 // COMPLETED
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

    // Future integrations
    external: {
        provider: String, // "GOOGLE"
        eventId: String
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true })

ensureAuditPlugin(MeetingSchema, "MEETING")
statsInvalidatePlugin(MeetingSchema)

const Meeting =
    mongoose.models.Meeting ||
    mongoose.model<IMeeting>("Meeting", MeetingSchema)

ensureAuditPlugin(Meeting.schema, "MEETING")
statsInvalidatePlugin(Meeting.schema)

export default Meeting