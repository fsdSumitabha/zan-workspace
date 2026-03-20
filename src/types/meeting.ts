import { MeetingStatus } from "@/constants/meetingStatus"
import { MeetingType } from "@/constants/meetingTypes"
import { EntityType } from "@/constants/entityTypes"

export interface Meeting {
    _id: string

    entityType: EntityType
    entityId: string

    title: string
    agenda: string
    description?: string

    meetingType: MeetingType
    meetingLink?: string

    attendees: string[]

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