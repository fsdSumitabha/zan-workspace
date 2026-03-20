export const INTERACTION_TYPE = {
    MEETING_SCHEDULED: 2010,
    MEETING_COMPLETED: 2020,
    MEETING_CANCELLED: 2030,
    MEETING_RESCHEDULED: 2040,

    NOTE_ADDED: 2110,

    CALL_MADE: 2210,

    DOCUMENT_UPLOADED: 2310,

    PROPOSAL_SENT: 2410
} as const

export type InteractionType = (typeof INTERACTION_TYPE)[keyof typeof INTERACTION_TYPE]

export const INTERACTION_TYPE_META: Record<
    InteractionType,
    { label: string; icon: string; color: string }
> = {
    2010: {
        label: "Meeting Scheduled",
        icon: "calendar",
        color: "blue"
    },
    2020: {
        label: "Meeting Completed",
        icon: "check",
        color: "green"
    },
    2030: {
        label: "Meeting Cancelled",
        icon: "times",
        color: "red"
    },
    2040: {
        label: "Meeting Rescheduled",
        icon: "refresh",
        color: "yellow"
    },
    2110: {
        label: "Note Added",
        icon: "file",
        color: "gray"
    },
    2210: {
        label: "Call Made",
        icon: "phone",
        color: "purple"
    },
    2310: {
        label: "Document Uploaded",
        icon: "doc",
        color: "teal"
    },
    2410: {
        label: "Proposal Sent",
        icon: "briefcase",
        color: "orange"
    }
}