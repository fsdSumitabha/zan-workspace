import { MeetingStatus } from "@/constants/meetingStatus"
import { MeetingType } from "@/constants/meetingTypes"
import { EntityType } from "@/constants/entityTypes"
import { UserRole } from "@/constants/userRoles"

/**
 * Subset of User fields exposed when `attendees` is populated by the
 * meetings GET endpoint (see `users/picker/route.ts` for the matching
 * selector used by the meeting-creation form).
 */
export interface MeetingAttendee {
    _id: string
    name: string
    email?: string
    role?: UserRole
    avatar?: string
}

export interface Meeting {
    _id: string

    entityType: EntityType
    entityId: string

    title: string
    agenda: string
    description?: string

    meetingType: MeetingType
    meetingLink?: string

    /**
     * Either raw ObjectId strings (when used as POST payload) or the
     * populated User subset (when read from the GET endpoint).
     */
    attendees: string[] | MeetingAttendee[]

    scheduledAt: string

    status: MeetingStatus

    outcome?: string

    rescheduleHistory: {
        oldDate: string
        newDate: string
        reason?: string
        changedBy?: string
        changedAt: string
    }[]

    external?: {
        provider?: string
        eventId?: string
    }

    createdBy?: string

    createdAt: string
    updatedAt: string
}