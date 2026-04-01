export const INTERACTION_TYPE = {
    MEETING_SCHEDULED: 2010,
    MEETING_COMPLETED: 2020,
    MEETING_CANCELLED: 2030,
    MEETING_RESCHEDULED: 2040,

    NOTE_ADDED: 2110,

    CALL_MADE: 2210,

    DOCUMENT_UPLOADED: 2310,

    QUOTATION_SENT: 2410
} as const

export type InteractionType = (typeof INTERACTION_TYPE)[keyof typeof INTERACTION_TYPE]

export const INTERACTION_TYPE_META: Record<
    InteractionType,
    { label: string; icon: string; color: string }
> = {
    2010: {
        label: "Meeting Scheduled",
        icon: "calendar",
        color: "border border-blue-600 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
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
        color: "border border-purple-500 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
    },
    2310: {
        label: "Document Uploaded",
        icon: "doc",
        color: "border border-teal-500 bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300"
    },
    2410: {
        label: "Quotation Sent",
        icon: "briefcase",
        color: "border border-orange-500 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-200"
    }
}