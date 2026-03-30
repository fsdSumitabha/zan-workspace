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
        color: "bg-blue-600 text-white"
    },
    2020: {
        label: "Meeting Completed",
        icon: "check",
        color: "bg-green-600 text-white"
    },
    2030: {
        label: "Meeting Cancelled",
        icon: "times",
        color: "bg-red-600 text-white"
    },
    2040: {
        label: "Meeting Rescheduled",
        icon: "refresh",
        color: "bg-yellow-500 text-black"
    },
    2110: {
        label: "Note Added",
        icon: "file",
        color: "border border-gray-500 bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300"
    },
    2210: {
        label: "Call Made",
        icon: "phone",
        color: "bg-purple-600 text-white"
    },
    2310: {
        label: "Document Uploaded",
        icon: "doc",
        color: "bg-teal-600 text-white"
    },
    2410: {
        label: "Proposal Sent",
        icon: "briefcase",
        color: "bg-orange-600 text-white"
    }
}